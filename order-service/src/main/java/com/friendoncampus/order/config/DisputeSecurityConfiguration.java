package com.friendoncampus.order.config;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
@Configuration public class DisputeSecurityConfiguration {
 @Bean @Order(0) SecurityFilterChain disputeRoutes(HttpSecurity http,@Value("${app.service-auth.trusted-keys:{}}")String trust)throws Exception{
  return http.securityMatcher("/internal/orders/*/review", "/internal/orders/*/dispute-resolution")
   .csrf(AbstractHttpConfigurer::disable).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .authorizeHttpRequests(a->a.anyRequest().authenticated())
   .oauth2ResourceServer(o->o.jwt(j->j.decoder(new ServiceTokenDecoder("order-service",trust,Set.of("admin-service"))::decode))).build();
 }
}