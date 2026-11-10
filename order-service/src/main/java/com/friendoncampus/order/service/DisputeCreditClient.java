package com.friendoncampus.order.service;
import java.net.*;import java.net.http.*;import java.time.*;import java.util.*;import java.security.*;import java.security.interfaces.RSAPrivateKey;import java.security.spec.PKCS8EncodedKeySpec;
import com.nimbusds.jose.*;import com.nimbusds.jose.crypto.RSASSASigner;import com.nimbusds.jwt.*;
import org.springframework.beans.factory.annotation.Value;import org.springframework.stereotype.Component;import org.springframework.http.HttpStatus;import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;import tools.jackson.databind.json.JsonMapper;
@Component public class DisputeCreditClient {
 private final URI base;private final String kid,key;private final JsonMapper json=JsonMapper.builder().build();
 private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
 public DisputeCreditClient(@Value("${app.credit.base-url:http://localhost:8083}")URI base,@Value("${app.service-auth.key-id:}")String kid,@Value("${app.service-auth.private-key:}")String key){this.base=base;this.kid=kid;this.key=key;}
 public JsonNode settle(DisputeReviewService.Review order,UUID operation,String disposition,String actorToken){
  try{
   Instant now=Instant.now();var jwt=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).type(JOSEObjectType.JWT).build(),new JWTClaimsSet.Builder().issuer("foc-service-auth").subject("order-service").audience("credit-service").issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(60))).jwtID(UUID.randomUUID().toString()).build());
   var privateKey=(RSAPrivateKey)KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(key)));if(privateKey.getModulus().bitLength()<2048)throw new IllegalArgumentException();jwt.sign(new RSASSASigner(privateKey));
   Map<String,Object> body=new LinkedHashMap<>();body.put("operationId",operation);body.put("caseId",order.caseId());body.put("requesterId",order.requesterId());body.put("courierId",order.courierId());body.put("disposition",disposition);
   var request=java.net.http.HttpRequest.newBuilder(base.resolve("/internal/credits/orders/"+order.orderId()+"/dispute-resolution")).timeout(Duration.ofSeconds(8)).header("Authorization","Bearer "+jwt.serialize()).header("X-Actor-Token",actorToken).header("Content-Type","application/json").POST(java.net.http.HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
   var response=http.send(request,HttpResponse.BodyHandlers.ofString());if(response.statusCode()!=200)throw new IllegalStateException();var result=json.readTree(response.body());
   if(!operation.toString().equals(result.path("operationId").asText())||!order.caseId().toString().equals(result.path("caseId").asText())||!order.orderId().toString().equals(result.path("orderId").asText())||!disposition.equals(result.path("disposition").asText())||!result.path("complete").asBoolean()||!Set.of("ABSENT","RELEASED","SETTLED","COMPENSATED").contains(result.path("reservationStatus").asText()))throw new IllegalArgumentException();
   if("RETURN_TO_REQUESTER".equals(disposition)&&!"RELEASED".equals(result.path("reservationStatus").asText())||"PAY_COURIER".equals(disposition)&&!"SETTLED".equals(result.path("reservationStatus").asText()))throw new IllegalArgumentException();
   return result;
  }catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Credit settlement is unconfirmed. Resume the same dispute resolution.");}
 }
}
