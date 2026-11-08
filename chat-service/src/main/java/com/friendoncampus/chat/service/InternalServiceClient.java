package com.friendoncampus.chat.service;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.friendoncampus.chat.config.ServiceTokens;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class InternalServiceClient {
    private final URI adminBase,userBase,orderBase,creditBase;
    private final ServiceTokens tokens;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final JsonMapper json=JsonMapper.builder().build();
    public InternalServiceClient(@Value("${app.admin.base-url}") URI adminBase,
            @Value("${app.user.base-url}") URI userBase,@Value("${app.order.base-url}") URI orderBase,
            @Value("${app.credit.base-url}") URI creditBase,ServiceTokens tokens){
        this.adminBase=checked(adminBase);this.userBase=checked(userBase);this.orderBase=checked(orderBase);this.creditBase=checked(creditBase);this.tokens=tokens;
    }
    public JsonNode caseAccess(UUID caseId,UUID actorId,UUID participantId){
        String query="?actorId="+actorId+(participantId==null?"":"&participantId="+participantId);
        return get(adminBase.resolve("/internal/admin/cases/"+caseId+"/access"+query),"admin-service");
    }
    public JsonNode userEligibility(UUID userId){
        return get(userBase.resolve("/internal/users/"+userId+"/admin-eligibility"),"user-service");
    }
    public java.util.List<JsonNode> orderEvidence(UUID orderId){return all(orderBase,"/internal/orders/orders/"+orderId+"/evidence","order-service");}
    public java.util.List<JsonNode> creditEvidence(UUID orderId){return all(creditBase,"/internal/credits/orders/"+orderId+"/evidence","credit-service");}
    public java.util.List<JsonNode> adminEvidence(UUID orderId,UUID caseId){return all(adminBase,"/internal/admin/orders/"+orderId+"/evidence?caseId="+caseId,"admin-service");}
    private java.util.List<JsonNode> all(URI base,String path,String destination){
        var pages=new java.util.ArrayList<JsonNode>();String cursor=null;
        do{String separator=path.contains("?")?"&":"?";JsonNode page=get(base.resolve(path+separator+"limit=100"+(cursor==null?"":"&cursor="+URLEncoder.encode(cursor,StandardCharsets.UTF_8))),destination);pages.add(page);cursor=page.path("nextCursor").isNull()?null:page.path("nextCursor").asText(null);}while(cursor!=null);return pages;
    }
    private JsonNode get(URI uri,String destination){
        try{
            var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3)).header("Authorization","Bearer "+tokens.issue(destination)).header("Accept","application/json").GET().build();
            var response=http.send(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if(response.statusCode()<200||response.statusCode()>=300)throw new IllegalStateException("Dependency returned "+response.statusCode());
            return json.readTree(response.body());
        }catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IllegalStateException("Dependency interrupted",ex);}
        catch(Exception ex){throw new IllegalStateException("Dependency unavailable",ex);}
    }
    private static URI checked(URI uri){if(uri.getHost()==null||!java.util.Set.of("http","https").contains(uri.getScheme()))throw new IllegalArgumentException("Internal URL must be HTTP(S)");return uri;}
}
