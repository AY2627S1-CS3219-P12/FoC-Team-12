package com.friendoncampus.order.config;

import java.security.*;import java.security.interfaces.RSAPublicKey;import java.security.spec.X509EncodedKeySpec;import java.time.Instant;import java.util.*;
import com.nimbusds.jose.*;import com.nimbusds.jose.crypto.RSASSAVerifier;import com.nimbusds.jwt.*;
import org.springframework.security.oauth2.jwt.*;import tools.jackson.databind.*;import tools.jackson.databind.json.JsonMapper;

public final class ServiceTokenDecoder {
    private final JsonNode trusted; private final String audience;
    public ServiceTokenDecoder(String audience,String json){try{this.audience=audience;trusted=JsonMapper.builder().build().readTree(json);if(!trusted.isObject())throw new IllegalArgumentException();}catch(Exception ex){throw new IllegalArgumentException("Invalid service trust",ex);}}
    public Jwt decode(String raw){try{SignedJWT t=SignedJWT.parse(raw);JsonNode e=trusted.get(t.getHeader().getKeyID());if(e==null||!JWSAlgorithm.RS256.equals(t.getHeader().getAlgorithm()))throw new IllegalArgumentException();RSAPublicKey k=(RSAPublicKey)KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(e.path("publicKey").asText())));if(!t.verify(new RSASSAVerifier(k)))throw new IllegalArgumentException();JWTClaimsSet c=t.getJWTClaimsSet();Instant now=Instant.now(),iat=c.getIssueTime().toInstant(),exp=c.getExpirationTime().toInstant();if(!"foc-service-auth".equals(c.getIssuer())||!"chat-service".equals(c.getSubject())||!c.getSubject().equals(e.path("subject").asText())||!c.getAudience().contains(audience)||!exp.isAfter(now)||exp.isAfter(iat.plusSeconds(60))||c.getJWTID()==null)throw new IllegalArgumentException();return new Jwt(raw,iat,exp,t.getHeader().toJSONObject(),c.getClaims());}catch(Exception ex){throw new BadJwtException("Invalid service assertion");}}
}
