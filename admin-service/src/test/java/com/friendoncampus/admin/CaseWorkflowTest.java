package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@Testcontainers(disabledWithoutDocker=true)
class CaseWorkflowTest {
    @Container static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",postgres::getJdbcUrl); r.add("spring.datasource.username",postgres::getUsername); r.add("spring.datasource.password",postgres::getPassword);
    }
    @Autowired CaseService service;
    @Autowired CaseAccessService access;
    @Autowired JdbcTemplate db;
    @MockitoBean UserEligibilityClient users;
    @MockitoBean ChatEligibilityClient chat;
    final JsonMapper json = JsonMapper.builder().build();
    final UUID order = UUID.randomUUID(), reporter=UUID.randomUUID(), courier=UUID.randomUUID(), reviewer=UUID.randomUUID();
    Jwt jwt(UUID id, String role) { return Jwt.withTokenValue("actor-jwt").header("alg","RS256").subject(id.toString()).claim("role",role).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build(); }
    @BeforeEach void prepare() {
        db.execute("TRUNCATE admin_case_outbox,admin_case_audit,admin_mutation_receipts,admin_statements,admin_case_participants,admin_cases CASCADE");
        when(users.find(any())).thenAnswer(call -> new UserEligibilityClient.Eligibility(call.getArgument(0),true,true));
        when(chat.check(any(),any(),anyString())).thenReturn(new ChatEligibilityClient.Eligibility(true,true,"evidence-1"));
    }
    UUID caseId(CaseViews.Mutation response) { return UUID.fromString(json.readTree(response.body()).path("case").path("caseId").asText()); }
    long count(String table) { return db.queryForObject("SELECT count(*) FROM "+table,Long.class); }
    CaseViews.Mutation report(UUID actor, UUID key) { return service.report(jwt(actor,"REQUESTER"),key,order,"Pickup issue"); }

    @Test void createsCaseStatementAuditAndEventInOneTransactionAndPinsEligibility() {
        var response=report(reporter,UUID.randomUUID()); assertEquals(201,response.status());
        UUID id=caseId(response);
        assertEquals("Pickup issue",service.reportStatus(jwt(reporter,"REQUESTER"),id).ownStatement().description());
        assertEquals("evidence-1",db.queryForObject("SELECT eligibility_revision FROM admin_statements",String.class));
        assertEquals(1,count("admin_cases")); assertEquals(1,count("admin_case_audit")); assertEquals(1,count("admin_case_outbox"));
        var event=json.readTree(db.queryForObject("SELECT payload FROM admin_case_outbox",String.class));
        assertEquals("CaseOpened",event.path("eventType").asText()); assertEquals(id.toString(),event.path("aggregateId").asText());
        assertEquals(1,event.path("data").path("sourceSequence").asLong()); assertEquals(reporter.toString(),event.path("actor").path("userId").asText());
        assertEquals("admin.events",db.queryForObject("SELECT topic FROM admin_case_outbox",String.class));
    }
    @Test void joinsExistingCaseAndKeepsParticipantViewsPrivate() {
        UUID id=caseId(report(reporter,UUID.randomUUID()));
        var second=service.report(jwt(courier,"COURIER"),UUID.randomUUID(),order,"Courier statement");
        assertEquals(id,caseId(second)); assertEquals(1,count("admin_cases")); assertEquals(2,count("admin_statements"));
        assertEquals(2,count("admin_case_audit")); assertEquals(1,count("admin_case_outbox"));
        assertEquals("Pickup issue",service.reportStatus(jwt(reporter,"REQUESTER"),id).ownStatement().description());
        assertEquals("Courier statement",service.reportStatus(jwt(courier,"COURIER"),id).ownStatement().description());
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,()->service.reportStatus(jwt(UUID.randomUUID(),"REQUESTER"),id)).getStatusCode());
        var detail=service.detail(jwt(reviewer,"ADMIN"),id); assertEquals(2,detail.statements().size());
        assertTrue(json.readTree(json.writeValueAsString(detail)).has("case"));
    }
    @Test void replaysOriginalOutcomeAfterStateChangeAndRejectsKeyMismatch() {
        UUID key=UUID.randomUUID(); var original=report(reporter,key); UUID id=caseId(original);
        assertEquals(200,service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,1).status());
        when(chat.check(any(),any(),anyString())).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        assertEquals(original,report(reporter,key));
        assertEquals(409,service.report(jwt(reporter,"REQUESTER"),key,order,"Different body").status());
        assertEquals(409,report(courier,key).status()); assertEquals(1,count("admin_statements")); assertEquals(2,count("admin_case_outbox"));
    }
    @Test void duplicateStatementAndResolvedReportsCannotMutate() {
        UUID id=caseId(report(reporter,UUID.randomUUID()));
        UUID duplicateKey=UUID.randomUUID(); var denied=report(reporter,duplicateKey); assertEquals(409,denied.status()); assertEquals(denied,report(reporter,duplicateKey));
        db.update("UPDATE admin_cases SET state='RESOLVED',reviewer_id=? WHERE id=?",reviewer,id);
        assertEquals(409,report(courier,UUID.randomUUID()).status()); assertEquals(1,count("admin_case_audit"));
    }
    @Test void rejectsMissingEvidenceIneligibilityInactiveAndInvalidInput() {
        when(chat.check(any(),any(),anyString())).thenReturn(new ChatEligibilityClient.Eligibility(false,true,"revision"));
        assertEquals(403,report(reporter,UUID.randomUUID()).status());
        when(chat.check(any(),any(),anyString())).thenReturn(new ChatEligibilityClient.Eligibility(true,false,"revision"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->report(reporter,UUID.randomUUID())).getStatusCode());
        when(users.find(reporter)).thenReturn(new UserEligibilityClient.Eligibility(reporter,false,false));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->report(reporter,UUID.randomUUID())).getStatusCode());
        assertEquals(0,count("admin_cases")); assertEquals(0,count("admin_case_outbox"));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.report(jwt(reviewer,"ADMIN"),UUID.randomUUID(),order,"Issue")).getStatusCode());
    }
    @Test void firstReportRaceJoinsOneCaseAndSameKeyRaceHasOneEffect() throws Exception {
        var outcomes=race(()->report(reporter,UUID.randomUUID()),()->report(courier,UUID.randomUUID()));
        assertEquals(201,outcomes.get(0).status()); assertEquals(201,outcomes.get(1).status()); assertEquals(caseId(outcomes.get(0)),caseId(outcomes.get(1)));
        assertEquals(1,count("admin_cases")); assertEquals(2,count("admin_statements")); assertEquals(1,count("admin_case_outbox"));
        UUID otherOrder=UUID.randomUUID(), key=UUID.randomUUID();
        outcomes=race(()->service.report(jwt(reporter,"REQUESTER"),key,otherOrder,"Retry"),()->service.report(jwt(reporter,"REQUESTER"),key,otherOrder,"Retry"));
        assertEquals(outcomes.get(0),outcomes.get(1)); assertEquals(2,count("admin_cases")); assertEquals(3,count("admin_statements"));
    }
    @Test void competingClaimsHaveOneWinnerAndNoExtraEventOnReplay() throws Exception {
        UUID id=caseId(report(reporter,UUID.randomUUID())); UUID key=UUID.randomUUID(); UUID other=UUID.randomUUID();
        var results=race(()->service.claim(jwt(reviewer,"ADMIN"),key,id,1),()->service.claim(jwt(other,"ADMIN"),UUID.randomUUID(),id,1));
        assertEquals(List.of(200,409),results.stream().map(CaseViews.Mutation::status).sorted().toList());
        assertEquals(results.get(0),service.claim(jwt(reviewer,"ADMIN"),key,id,1)); assertEquals(2,count("admin_case_audit")); assertEquals(2,count("admin_case_outbox"));
        var detail=service.detail(jwt(other,"ADMIN"),id);
        UUID winner=detail.caseSummary().reviewerId();
        assertTrue(access.check(id,winner,reporter).canWriteConversation());
        UUID loser=winner.equals(reviewer)?other:reviewer;
        assertFalse(access.check(id,loser,reporter).canWriteConversation());
    }
    @Test void concurrentDistinctKeysCannotAddTwoStatementsForOneReporter() throws Exception {
        var results=race(()->report(reporter,UUID.randomUUID()),()->report(reporter,UUID.randomUUID()));
        assertEquals(List.of(201,409),results.stream().map(CaseViews.Mutation::status).sorted().toList());
        assertEquals(1,count("admin_cases")); assertEquals(1,count("admin_statements"));
        assertEquals(1,count("admin_case_audit")); assertEquals(1,count("admin_case_outbox"));
    }
    @Test void staleRevisionAfterJoinAndRevokedAdminAreDenied() {
        UUID id=caseId(report(reporter,UUID.randomUUID())); report(courier,UUID.randomUUID());
        assertEquals(409,service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,1).status());
        assertEquals(200,service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,2).status());
        var events=db.queryForList("SELECT source_sequence FROM admin_case_outbox ORDER BY source_sequence",Long.class);
        assertEquals(List.of(1L,2L),events);
        var claim=json.readTree(db.queryForObject("SELECT payload FROM admin_case_outbox WHERE event_type='CaseClaimed'",String.class));
        assertEquals(3,claim.path("aggregateVersion").asLong());
        when(users.find(reviewer)).thenReturn(new UserEligibilityClient.Eligibility(reviewer,true,false));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.queue(jwt(reviewer,"ADMIN"),null,null,0,20)).getStatusCode());
    }
    @Test void queueFiltersAndBoundsDoNotExposeDataToParticipants() {
        UUID id=caseId(report(reporter,UUID.randomUUID()));
        assertEquals(1,service.queue(jwt(reviewer,"ADMIN"),AdminCase.State.OPEN,order,0,20).totalElements());
        assertEquals(1,service.queue(jwt(reviewer,"ADMIN"),null,id,0,20).totalElements());
        assertEquals(0,service.queue(jwt(reviewer,"ADMIN"),AdminCase.State.UNDER_REVIEW,null,0,20).totalElements());
        assertThrows(ResponseStatusException.class,()->service.queue(jwt(reviewer,"ADMIN"),null,null,-1,20));
        assertThrows(ResponseStatusException.class,()->service.queue(jwt(reviewer,"ADMIN"),null,null,0,101));
        assertThrows(ResponseStatusException.class,()->service.detail(jwt(reporter,"REQUESTER"),id));
    }
    @Test void outboxFailureRollsBackEveryPartOfFirstMutation() {
        db.execute("ALTER TABLE admin_case_outbox ADD CONSTRAINT test_outbox_failure CHECK (event_type <> 'CaseOpened')");
        try {
            assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->report(reporter,UUID.randomUUID())).getStatusCode());
            for(String table:List.of("admin_cases","admin_statements","admin_case_audit","admin_case_outbox","admin_mutation_receipts")) assertEquals(0,count(table));
        } finally { db.execute("ALTER TABLE admin_case_outbox DROP CONSTRAINT test_outbox_failure"); }
    }
    private List<CaseViews.Mutation> race(Callable<CaseViews.Mutation> first,Callable<CaseViews.Mutation> second) throws Exception {
        var executor=Executors.newFixedThreadPool(2); var barrier=new CyclicBarrier(2);
        try { var a=executor.submit(()->{barrier.await(5,TimeUnit.SECONDS); return first.call();}); var b=executor.submit(()->{barrier.await(5,TimeUnit.SECONDS); return second.call();});
            return List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
    }
}
