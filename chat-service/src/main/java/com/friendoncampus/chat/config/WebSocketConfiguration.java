package com.friendoncampus.chat.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfiguration implements WebSocketMessageBrokerConfigurer {
    private final JwtDecoder decoder; private final JwtAuthenticationConverter converter;
    public WebSocketConfiguration(JwtDecoder decoder,JwtAuthenticationConverter converter){this.decoder=decoder;this.converter=converter;}
    @Override public void registerStompEndpoints(StompEndpointRegistry registry){registry.addEndpoint("/ws/chat").setAllowedOriginPatterns("*");}
    @Override public void configureMessageBroker(MessageBrokerRegistry registry){registry.enableSimpleBroker("/queue");registry.setUserDestinationPrefix("/user");}
    @Override public void configureClientInboundChannel(ChannelRegistration registration){registration.interceptors(new ChannelInterceptor(){
        @Override public Message<?> preSend(Message<?> message,MessageChannel channel){StompHeaderAccessor a=StompHeaderAccessor.wrap(message);if(a.getCommand()==StompCommand.CONNECT){String h=a.getFirstNativeHeader("Authorization");if(h==null||!h.startsWith("Bearer "))throw new IllegalArgumentException("Bearer token required");Jwt jwt=decoder.decode(h.substring(7));AbstractAuthenticationToken auth=converter.convert(jwt);a.setUser(auth);}if(a.getCommand()==StompCommand.SUBSCRIBE){if(a.getUser()==null)throw new IllegalArgumentException("Authentication required");if(!"/user/queue/chat".equals(a.getDestination()))throw new IllegalArgumentException("Invalid subscription");}return message;}});}
}
