package com.friendoncampus.credit.web;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.friendoncampus.credit.authorization.CurrentAuthorization;
import com.friendoncampus.credit.service.DisputeSettlementService;
@RestController public class DisputeSettlementController {
 private final DisputeSettlementService service;private final JwtDecoder users;private final CurrentAuthorization current;
 public DisputeSettlementController(DisputeSettlementService service,JwtDecoder users,CurrentAuthorization current){this.service=service;this.users=users;this.current=current;}
 private Jwt decode(String raw){try{return users.decode(raw);}catch(JwtException ex){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Valid actor token required");}}
 public record Request(UUID operationId,UUID caseId,UUID requesterId,UUID courierId,String disposition){}
 @PostMapping("/internal/credits/orders/{orderId}/dispute-resolution")
 public ResponseEntity<String> settle(@PathVariable UUID orderId,@RequestHeader("X-Actor-Token")String token,@RequestBody Request body){
  Jwt actor=decode(token);if(!"ADMIN".equals(actor.getClaimAsString("role")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Administrator role required");current.require(actor);
  return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_JSON).body(service.settle(body.operationId(),body.caseId(),orderId,UUID.fromString(actor.getSubject()),body.requesterId(),body.courierId(),body.disposition()));
 }
}
