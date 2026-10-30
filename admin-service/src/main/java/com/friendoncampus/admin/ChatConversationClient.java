package com.friendoncampus.admin;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Consumer of the existing draft Chat contract; owns no messages or conversation permissions. */
@Component
public class ChatConversationClient {
    private final URI base;
    private final ServiceTokens tokens;
    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public ChatConversationClient(@Value("${app.chat.base-url}") URI base, ServiceTokens tokens) {
        if (base.getHost() == null || !Set.of("http", "https").contains(base.getScheme())) throw new IllegalArgumentException("Chat URL must be HTTP(S)");
        this.base = base; this.tokens = tokens;
    }
    public Conversation open(UUID caseId, UUID orderId, UUID participantId, UUID key, String actorToken) {
        try {
            var request = HttpRequest.newBuilder(base.resolve("/internal/chat/cases/" + caseId + "/conversations"))
                    .timeout(Duration.ofSeconds(3)).header("Authorization", "Bearer " + tokens.issue("chat-service"))
                    .header("X-Actor-Token", actorToken).header("Idempotency-Key", key.toString())
                    .header("Content-Type", "application/json").header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("participantUserId", participantId)))).build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (Set.of(401, 403, 404, 409).contains(response.statusCode()))
                throw new ResponseStatusException(HttpStatus.valueOf(response.statusCode()), "Chat could not authorize or open this conversation. Refresh case access before retrying.");
            if (response.statusCode() != 200) throw new IllegalArgumentException();
            var body = json.readTree(response.body());
            for (String field : List.of("conversationId", "caseId", "orderId", "participantUserId"))
                if (!body.path(field).isString() || !body.path(field).asText().matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw new IllegalArgumentException();
            if (!caseId.equals(UUID.fromString(body.path("caseId").asText())) || !orderId.equals(UUID.fromString(body.path("orderId").asText()))
                    || !participantId.equals(UUID.fromString(body.path("participantUserId").asText())) || !body.path("readOnly").isBoolean()) throw new IllegalArgumentException();
            return new Conversation(UUID.fromString(body.path("conversationId").asText()), caseId, orderId, participantId, body.path("readOnly").asBoolean());
        } catch (ResponseStatusException e) { throw e; }
        catch (Exception e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Chat is unavailable or returned an invalid conversation. The outcome may be uncertain; retry with the same request key.");
        }
    }
    public record Conversation(UUID conversationId, UUID caseId, UUID orderId, UUID participantUserId, boolean readOnly) { }
}
