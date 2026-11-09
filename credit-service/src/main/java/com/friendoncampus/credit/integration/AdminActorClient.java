package com.friendoncampus.credit.integration;

import java.net.URI;
import java.net.http.*;
import java.security.*;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.*;
import java.util.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Current User eligibility is read before Credit takes any account/operation lock. */
@Component
public class AdminActorClient {
    private final URI base;
    private final String kid, privateKey;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public AdminActorClient(@Value("${app.user.base-url:http://localhost:8081}") URI base,
            @Value("${app.service-auth.key-id:}") String kid,
            @Value("${app.service-auth.private-key:}") String privateKey) {
        if (base.getHost() == null || !Set.of("http", "https").contains(base.getScheme()))
            throw new IllegalArgumentException("User URL must be HTTP(S)");
        this.base=base; this.kid=kid; this.privateKey=privateKey;
    }
    public boolean eligible(UUID actor) {
        try {
            Instant now=Instant.now();
            var key=(RSAPrivateKey)KeyFactory.getInstance("RSA").generatePrivate(
                    new PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKey)));
            if (kid.isBlank() || key.getModulus().bitLength()<2048) throw new IllegalStateException();
            var jwt=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).type(JOSEObjectType.JWT).build(),
                    new JWTClaimsSet.Builder().issuer("foc-service-auth").subject("credit-service").audience("user-service")
                    .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(60))).jwtID(UUID.randomUUID().toString()).build());
            jwt.sign(new RSASSASigner(key));
            var response=http.send(HttpRequest.newBuilder(base.resolve("/internal/users/"+actor+"/admin-eligibility"))
                    .timeout(Duration.ofSeconds(3)).header("Authorization", "Bearer "+jwt.serialize())
                    .GET().build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode()==404) return false;
            if (response.statusCode()!=200) throw new IllegalStateException();
            var data=JsonMapper.builder().build().readTree(response.body());
            if (!actor.toString().equals(data.path("userId").asText()) || !data.path("active").isBoolean()
                    || !data.path("administrator").isBoolean()) throw new IllegalStateException();
            return data.path("active").asBoolean() && data.path("administrator").asBoolean();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Current User eligibility unavailable");
        } catch (Exception ex) { throw new IllegalStateException("Current User eligibility unavailable"); }
    }
}
