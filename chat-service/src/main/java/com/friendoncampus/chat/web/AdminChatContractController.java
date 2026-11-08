package com.friendoncampus.chat.web;

import java.util.*;
import org.springframework.http.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import com.friendoncampus.chat.service.AdminChatContractService;

@RestController
public class AdminChatContractController {
    private final AdminChatContractService service;
    public AdminChatContractController(AdminChatContractService service){this.service=service;}
    @GetMapping("/internal/chat/orders/{orderId}/report-eligibility")
    public ResponseEntity<Map<String,Object>> eligibility(@PathVariable UUID orderId,@RequestParam UUID userId,@RequestHeader("X-Actor-Token") String token){return noStore(service.eligibility(orderId,userId,service.actor(token)));}
    @GetMapping("/internal/chat/cases/{caseId}/timeline")
    public ResponseEntity<Map<String,Object>> timeline(@PathVariable UUID caseId,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit,@RequestHeader("X-Actor-Token") String token){return noStore(service.timeline(caseId,service.actor(token),cursor,limit));}
    @PostMapping("/internal/chat/cases/{caseId}/conversations")
    public ResponseEntity<Map<String,Object>> conversation(@PathVariable UUID caseId,@RequestHeader("Idempotency-Key") UUID key,@RequestHeader("X-Actor-Token") String token,@RequestBody ConversationRequest body){return noStore(service.openConversation(caseId,body.participantUserId(),key,service.actor(token)));}
    private static <T> ResponseEntity<T> noStore(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
    public record ConversationRequest(UUID participantUserId){}
}
