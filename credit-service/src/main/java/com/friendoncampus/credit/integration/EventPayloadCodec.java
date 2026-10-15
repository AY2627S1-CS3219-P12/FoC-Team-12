package com.friendoncampus.credit.integration;

import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

@Component
class EventPayloadCodec {

    private final ObjectMapper objectMapper;

    EventPayloadCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    CanonicalPayload canonicalize(String payloadJson) {
        try {
            String canonicalJson = objectMapper.writeValueAsString(objectMapper.readTree(payloadJson));
            return new CanonicalPayload(canonicalJson, EventFingerprint.sha256(canonicalJson));
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Event payload must be valid JSON", exception);
        }
    }

    record CanonicalPayload(String json, String hash) {
    }
}
