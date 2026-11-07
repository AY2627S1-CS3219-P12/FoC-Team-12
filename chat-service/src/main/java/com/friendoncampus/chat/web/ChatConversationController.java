package com.friendoncampus.chat.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.friendoncampus.chat.service.ChatConversationService;
import com.friendoncampus.chat.service.ChatConversationService.Attachment;
import com.friendoncampus.chat.service.ChatConversationService.Conversation;
import com.friendoncampus.chat.service.ChatConversationService.Message;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/chat")
public class ChatConversationController {
    private final ChatConversationService chats;
    public ChatConversationController(ChatConversationService chats){this.chats=chats;}
    @GetMapping("/orders/{orderId}/conversation") Conversation order(@PathVariable UUID orderId,@AuthenticationPrincipal Jwt jwt){return chats.byOrder(orderId,actor(jwt));}
    @GetMapping("/conversations/{id}") Conversation conversation(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt){return chats.get(id,actor(jwt));}
    @GetMapping("/conversations/{id}/messages") List<Message> messages(@PathVariable UUID id,@RequestParam(defaultValue="0") long after,@RequestParam(defaultValue="50") int limit,@AuthenticationPrincipal Jwt jwt){return chats.messages(id,actor(jwt),after,limit);}
    @PostMapping("/conversations/{id}/messages") Message send(@PathVariable UUID id,@Valid @RequestBody SendMessage request,@AuthenticationPrincipal Jwt jwt){return "IMAGE".equals(request.messageType())?chats.sendImage(id,actor(jwt),request.clientMessageId(),request.attachmentId()):chats.sendText(id,actor(jwt),request.clientMessageId(),request.messageType(),request.text(),request.quickReplyKey());}
    @PostMapping(path="/conversations/{id}/attachments",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) Attachment upload(@PathVariable UUID id,@RequestPart("file") MultipartFile file,@AuthenticationPrincipal Jwt jwt){return chats.upload(id,actor(jwt),file);}
    @GetMapping("/conversations/{id}/attachments/{attachmentId}") ResponseEntity<byte[]> download(@PathVariable UUID id,@PathVariable UUID attachmentId,@AuthenticationPrincipal Jwt jwt){var a=chats.attachment(id,attachmentId,actor(jwt));return ResponseEntity.ok().contentType(MediaType.parseMediaType(a.contentType())).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.inline().filename(a.filename(),StandardCharsets.UTF_8).build().toString()).body(a.content());}
    private static UUID actor(Jwt jwt){return UUID.fromString(jwt.getSubject());}
    public record SendMessage(@NotNull UUID clientMessageId,String messageType,String text,String quickReplyKey,UUID attachmentId){}
}
