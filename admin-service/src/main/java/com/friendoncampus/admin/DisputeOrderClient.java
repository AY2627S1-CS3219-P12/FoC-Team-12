package com.friendoncampus.admin;
import java.net.*;import java.net.http.*;import java.time.Duration;import java.util.*;
import org.springframework.beans.factory.annotation.Value;import org.springframework.stereotype.Component;import org.springframework.http.HttpStatus;import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;import tools.jackson.databind.json.JsonMapper;
@Component public class DisputeOrderClient {
 private final URI base;private final ServiceTokens tokens;private final JsonMapper json=JsonMapper.builder().build();private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
 public DisputeOrderClient(@Value("${app.order.base-url:http://localhost:8082}")URI base,ServiceTokens tokens){this.base=base;this.tokens=tokens;}
 public JsonNode freeze(UUID order,UUID caseId,String actor){return call(order,caseId,"/review",Map.of("caseId",caseId),actor);}
 public void validate(UUID order,UUID caseId,String disposition,String actor){
  if(disposition==null||!Set.of("RETURN_TO_REQUESTER","PAY_COURIER","KEEP_EXISTING").contains(disposition))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose the reserved-credit outcome.");
  var state=call(order,caseId,"/review?caseId="+caseId,null,actor);boolean reserved="RESERVED".equals(state.path("creditStatus").asText());
  if(reserved&&"KEEP_EXISTING".equals(disposition)||!reserved&&!"KEEP_EXISTING".equals(disposition)||"PAY_COURIER".equals(disposition)&&state.path("courierId").isNull())throw new ResponseStatusException(HttpStatus.CONFLICT,"Choose a credit outcome consistent with the confirmed reservation.");
 }
 public void finish(UUID order,UUID caseId,UUID operation,String disposition,String actor){var state=call(order,caseId,"/dispute-resolution",Map.of("caseId",caseId,"operationId",operation,"disposition",disposition),actor);if(!state.path("resolved").asBoolean()||!Set.of("COMPLETED","CANCELLED","EXPIRED","RESERVATION_FAILED").contains(state.path("state").asText()))throw unavailable();}
 private JsonNode call(UUID order,UUID caseId,String path,Object body,String actor){
  try{
   var builder=java.net.http.HttpRequest.newBuilder(base.resolve("/internal/orders/"+order+path)).timeout(Duration.ofSeconds(12)).header("Authorization","Bearer "+tokens.issue("order-service")).header("X-Actor-Token",actor).header("Accept","application/json");
   if(body==null)builder.GET();else builder.header("Content-Type","application/json").POST(java.net.http.HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
   var response=http.send(builder.build(),HttpResponse.BodyHandlers.ofString());if(response.statusCode()!=200)throw unavailable();var data=json.readTree(response.body());
   if(!order.toString().equals(data.path("orderId").asText())||!caseId.toString().equals(data.path("caseId").asText())||!data.path("participants").isArray()||data.path("participants").isEmpty())throw unavailable();
   for(var id:data.path("participants"))UUID.fromString(id.asText());return data;
  }catch(ResponseStatusException ex){throw ex;}catch(Exception ex){if(ex instanceof InterruptedException)Thread.currentThread().interrupt();throw unavailable();}
 }
 private static ResponseStatusException unavailable(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Errand review or finalization is unconfirmed. Resume the same request.");}
}
