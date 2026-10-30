package com.friendoncampus.admin;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CaseController.class)
@Import({SecurityConfiguration.class,ApiProblems.class})
class CaseHttpTest {
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder userJwtDecoder;
    @MockitoBean ServiceTokens services;
    @MockitoBean CaseService cases;
    UUID actor=UUID.randomUUID(), id=UUID.randomUUID(), order=UUID.randomUUID(), key=UUID.randomUUID();
    void role(String role){when(userJwtDecoder.decode("user")).thenReturn(Jwt.withTokenValue("user").header("alg","RS256").subject(actor.toString()).claim("role",role).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build());}
    @Test void separatesParticipantAndAdministratorRoutes() throws Exception {
        mvc.perform(get("/api/admin/cases")).andExpect(status().isUnauthorized()); role("REQUESTER");
        mvc.perform(get("/api/admin/cases").header("Authorization","Bearer user")).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/cases/{id}/claim",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"expectedRevision\":1}")).andExpect(status().isForbidden());
        role("ADMIN");
        mvc.perform(post("/api/admin/reports").header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"orderId\":\""+order+"\",\"description\":\"Issue\"}")).andExpect(status().isForbidden());
        verifyNoInteractions(cases);
    }
    @Test void validatesHeadersBodiesAndUuidFiltersBeforeService() throws Exception {
        role("REQUESTER");
        mvc.perform(post("/api/admin/reports").header("Authorization","Bearer user").contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/reports").header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"orderId\":\""+order+"\",\"description\":\" \"}")).andExpect(status().isBadRequest());
        role("ADMIN");
        mvc.perform(post("/api/admin/cases/{id}/claim",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"expectedRevision\":-1}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/cases?query=invalid").header("Authorization","Bearer user")).andExpect(status().isBadRequest());
        verifyNoInteractions(cases);
    }
    @Test void rendersExactPrivateWireShapeAndMutationProblemStatus() throws Exception {
        var summary=new CaseViews.Summary(id,order,AdminCase.State.OPEN,null,1,Instant.now());
        role("REQUESTER"); when(cases.reportStatus(any(),eq(id))).thenReturn(new CaseViews.ParticipantReport(summary,new CaseViews.Statement(actor,"Private statement",Instant.now())));
        mvc.perform(get("/api/admin/reports/{id}",id).header("Authorization","Bearer user")).andExpect(status().isOk()).andExpect(jsonPath("$.case.caseId").value(id.toString())).andExpect(jsonPath("$.caseSummary").doesNotExist()).andExpect(jsonPath("$.statements").doesNotExist()).andExpect(jsonPath("$.ownStatement.description").value("Private statement"));
        role("ADMIN"); when(cases.claim(any(),eq(key),eq(id),eq(1L))).thenReturn(new CaseViews.Mutation(409,"{\"title\":\"Conflict\",\"status\":409}"));
        mvc.perform(post("/api/admin/cases/{id}/claim",id).header("Authorization","Bearer user").header("Idempotency-Key",key).contentType("application/json").content("{\"expectedRevision\":1}")).andExpect(status().isConflict()).andExpect(content().contentType("application/problem+json")).andExpect(header().string("Cache-Control","no-store"));
    }
}
