package com.friendoncampus.order.web;
import java.util.*;import org.springframework.http.*;import org.springframework.security.oauth2.jwt.*;import org.springframework.web.bind.annotation.*;import org.springframework.web.server.ResponseStatusException;
import com.friendoncampus.order.authorization.CurrentAuthorization;import com.friendoncampus.order.service.DisputeReviewService;
@RestController public class DisputeReviewController {
 private final DisputeReviewService service;private final JwtDecoder users;private final CurrentAuthorization current;
 public DisputeReviewController(DisputeReviewService service,JwtDecoder users,CurrentAuthorization current){this.service=service;this.users=users;this.current=current;}
 private Jwt decode(String raw){try{return users.decode(raw);}catch(JwtException ex){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Valid actor token required");}}
 public record Freeze(UUID caseId){} public record Finish(UUID caseId,UUID operationId,String disposition){}
 private Jwt actor(String raw,Set<String> roles){Jwt actor=decode(raw);if(!roles.contains(actor.getClaimAsString("role")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Wrong actor mode");current.require(actor);return actor;}
 @PostMapping("/internal/orders/{orderId}/review") public ResponseEntity<DisputeReviewService.Review> freeze(@PathVariable UUID orderId,@RequestHeader("X-Actor-Token")String raw,@RequestBody Freeze body){var actor=actor(raw,Set.of("REQUESTER","COURIER","ADMIN"));return noStore(service.freeze(orderId,required(body.caseId()),UUID.fromString(actor.getSubject()),"ADMIN".equals(actor.getClaimAsString("role"))));}
 @GetMapping("/internal/orders/{orderId}/review") public ResponseEntity<DisputeReviewService.Review> read(@PathVariable UUID orderId,@RequestParam UUID caseId,@RequestHeader("X-Actor-Token")String raw){actor(raw,Set.of("ADMIN"));return noStore(service.read(orderId,caseId));}
 @PostMapping("/internal/orders/{orderId}/dispute-resolution") public ResponseEntity<DisputeReviewService.Review> finish(@PathVariable UUID orderId,@RequestHeader("X-Actor-Token")String raw,@RequestBody Finish body){actor(raw,Set.of("ADMIN"));return noStore(service.finish(orderId,required(body.caseId()),required(body.operationId()),body.disposition(),raw));}
 private static UUID required(UUID id){if(id==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Case and operation identities are required");return id;}
 private static <T> ResponseEntity<T> noStore(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
}
