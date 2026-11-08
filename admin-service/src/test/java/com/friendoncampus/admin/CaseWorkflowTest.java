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
    @Autowired EvidenceExportService exports;
    @Autowired CreditActionService creditActions;
    @Autowired ActionDeliveryStore deliveries;
    @Autowired ResolutionService resolutions;
    @Test void confirmedReferencesRecoverPrivatelyWithoutChatAndBecomeReadOnlyAfterClosure() {
        UUID id=reviewCase(), first=UUID.randomUUID(), second=UUID.randomUUID(), otherAdmin=UUID.randomUUID();
        service.report(jwt(courier,"COURIER"),UUID.randomUUID(),order,"Historical courier statement");
        when(conversations.open(eq(id),eq(order),eq(reporter),any(),anyString()))
                .thenReturn(new ChatConversationClient.Conversation(first,id,order,reporter,false));
        when(conversations.open(eq(id),eq(order),eq(courier),any(),anyString()))
                .thenReturn(new ChatConversationClient.Conversation(second,id,order,courier,false));
        assertTrue(service.confirmedConversations(jwt(reporter,"REQUESTER"),id,true).isEmpty());
        service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,reporter);
        service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,courier);
        clearInvocations(conversations,chat);
        long audit=count("admin_case_audit"), outbox=count("admin_case_outbox");
        var own=service.confirmedConversations(jwt(courier,"COURIER"),id,true);
        assertEquals(1,own.size());assertEquals(second,own.get(0).conversationId());assertFalse(own.get(0).readOnly());
        assertEquals(first,service.confirmedConversations(jwt(reporter,"REQUESTER"),id,true).get(0).conversationId());
        assertEquals(2,service.confirmedConversations(jwt(reviewer,"ADMIN"),id,false).size());
        assertTrue(service.confirmedConversations(jwt(otherAdmin,"ADMIN"),id,false).stream().allMatch(ChatConversationClient.Conversation::readOnly));
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,()->service.confirmedConversations(jwt(UUID.randomUUID(),"COURIER"),id,true)).getStatusCode());
        db.update("UPDATE admin_cases SET state='RESOLVED' WHERE id=?",id);
        assertTrue(service.confirmedConversations(jwt(reporter,"REQUESTER"),id,true).get(0).readOnly());
        assertTrue(service.confirmedConversations(jwt(reviewer,"ADMIN"),id,false).stream().allMatch(ChatConversationClient.Conversation::readOnly));
        when(users.find(courier)).thenReturn(new UserEligibilityClient.Eligibility(courier,false,false));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.confirmedConversations(jwt(courier,"COURIER"),id,true)).getStatusCode());
        when(users.find(reporter)).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->service.confirmedConversations(jwt(reporter,"REQUESTER"),id,true)).getStatusCode());
        assertEquals(audit,count("admin_case_audit"));assertEquals(outbox,count("admin_case_outbox"));
        verifyNoInteractions(conversations,chat);
    }
    @Test void ownReportLookupIsPrivateAndWorksWithoutChatButNewReportsFailClosed(){
        UUID id=reviewCase();reset(chat);
        when(chat.check(any(),any(),anyString())).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        var own=service.reportContext(jwt(reporter,"REQUESTER"),order);
        assertEquals("OWN_REPORT",own.status());assertEquals(id,own.caseId());assertEquals(AdminCase.State.UNDER_REVIEW,own.state());
        verifyNoInteractions(chat);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->service.reportContext(jwt(courier,"COURIER"),order)).getStatusCode());
        doReturn(new ChatEligibilityClient.Eligibility(false,true,"context")).when(chat).check(any(),any(),anyString());
        var other=service.reportContext(jwt(courier,"COURIER"),order);assertEquals("INELIGIBLE",other.status());assertNull(other.caseId());assertNull(other.state());
        when(chat.check(any(),any(),anyString())).thenReturn(new ChatEligibilityClient.Eligibility(true,true,"context"));
        assertEquals("ELIGIBLE",service.reportContext(jwt(courier,"COURIER"),order).status());
        db.update("UPDATE admin_cases SET state='RESOLVED' WHERE id=?",id);
        assertEquals("OWN_REPORT",service.reportContext(jwt(reporter,"REQUESTER"),order).status());
        assertEquals(AdminCase.State.RESOLVED,service.reportContext(jwt(reporter,"REQUESTER"),order).state());
        assertEquals("INELIGIBLE",service.reportContext(jwt(courier,"COURIER"),order).status());
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.reportContext(jwt(reviewer,"ADMIN"),order)).getStatusCode());
        when(users.find(reporter)).thenReturn(new UserEligibilityClient.Eligibility(reporter,false,false));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.reportContext(jwt(reporter,"REQUESTER"),order)).getStatusCode());
    }
    @Test void incompleteReportEligibilityIsNotTreatedAsNoReport(){
        when(chat.check(any(),any(),anyString())).thenReturn(new ChatEligibilityClient.Eligibility(true,false,"incomplete"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->service.reportContext(jwt(reporter,"REQUESTER"),order)).getStatusCode());
        assertEquals(0,count("admin_cases"));assertEquals(0,count("admin_statements"));
    }
    @MockitoBean ChatTimelineClient timelines;
    @Autowired JdbcTemplate db;
    @MockitoBean UserEligibilityClient users;
    @MockitoBean ChatEligibilityClient chat;
    @MockitoBean ChatConversationClient conversations;
    final JsonMapper json = JsonMapper.builder().build();
    final UUID order = UUID.randomUUID(), reporter=UUID.randomUUID(), courier=UUID.randomUUID(), reviewer=UUID.randomUUID();
    Jwt jwt(UUID id, String role) { return Jwt.withTokenValue("actor-jwt").header("alg","RS256").subject(id.toString()).claim("role",role).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build(); }
    @BeforeEach void prepare() {
        db.execute("TRUNCATE admin_action_quarantine,admin_case_outbox,admin_case_audit,admin_mutation_receipts,admin_statements,admin_case_participants,admin_cases CASCADE");
        when(users.find(any())).thenAnswer(call -> new UserEligibilityClient.Eligibility(call.getArgument(0),true,true));
        when(chat.check(any(),any(),anyString())).thenReturn(new ChatEligibilityClient.Eligibility(true,true,"evidence-1"));
    }
    UUID caseId(CaseViews.Mutation response) { return UUID.fromString(json.readTree(response.body()).path("case").path("caseId").asText()); }
    tools.jackson.databind.node.ObjectNode freshEvidence(UUID id) {
        var node=(tools.jackson.databind.node.ObjectNode)json.readTree(EvidenceFixtures.serialize(EvidenceFixtures.timeline()).replace(EvidenceFixtures.CASE.toString(),id.toString()).replace(EvidenceFixtures.ORDER.toString(),order.toString()));
        var coverage=(tools.jackson.databind.node.ObjectNode)node.path("coverage");coverage.put("asOf",Instant.now().toString());
        long sequence=db.queryForObject("SELECT source_sequence FROM admin_cases WHERE id=?",Long.class,id);
        for(var cp:coverage.path("checkpoints")){var checkpoint=(tools.jackson.databind.node.ObjectNode)cp;checkpoint.put("checkedAt",Instant.now().toString());checkpoint.put("committedSequence",sequence);checkpoint.put("projectedSequence",sequence);}
        return node;
    }
    long revision(UUID id){return db.queryForObject("SELECT revision FROM admin_cases WHERE id=?",Long.class,id);}
    void evidence(UUID id){when(timelines.fetch(eq(id),eq(order),anyString(),isNull(),eq(100))).thenAnswer(call->freshEvidence(id));}
    CaseViews.Mutation resolve(UUID id,UUID key,long revision){return resolutions.resolve(jwt(reviewer,"ADMIN"),id,key,"Reviewed all evidence; no further action required",revision,List.of());}
    @Test void resolutionWithoutActionsIsAtomicImmutablePrivateAndReplayable() {
        UUID id=reviewCase(),key=UUID.randomUUID();evidence(id);long version=revision(id);
        var result=resolve(id,key,version);assertEquals(200,result.status());
        when(timelines.fetch(any(),any(),anyString(),any(),anyInt())).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        assertEquals(result,resolve(id,key,version));assertEquals(1,count("admin_case_decisions"));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM admin_case_outbox WHERE event_type='CaseResolved'",Integer.class));
        assertEquals(AdminCase.State.RESOLVED,service.reportStatus(jwt(reporter,"REQUESTER"),id).caseSummary().state());
        assertFalse(json.writeValueAsString(service.reportStatus(jwt(reporter,"REQUESTER"),id)).contains("resolution"));
        assertFalse(access.check(id,reporter,reporter).canWriteConversation());assertTrue(access.check(id,reporter,reporter).canReadConversation());
        assertFalse(access.check(id,reviewer,reporter).canWriteConversation());
        assertEquals(409,report(courier,UUID.randomUUID()).status());
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->correction(id,UUID.randomUUID(),2)).getStatusCode());
        assertThrows(org.springframework.dao.DataAccessException.class,()->db.update("UPDATE admin_case_decisions SET resolution='rewrite' WHERE case_id=?",id));
        assertTrue(exports.read(order,id,null,100).records().stream().anyMatch(r->"CaseResolved".equals(r.path("action").asText())));
    }
    @Test void resolutionRequiresFreshCompleteEvidenceAndCurrentReviewerAndRevision() {
        UUID id=reviewCase();evidence(id);
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->resolutions.resolve(jwt(courier,"ADMIN"),id,UUID.randomUUID(),"Reason",revision(id),List.of())).getStatusCode());
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),0)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->resolutions.resolve(jwt(reviewer,"ADMIN"),id,UUID.randomUUID()," ",revision(id),List.of())).getStatusCode());
        for(String fault:List.of("old","unknown","lag","gaps","future","checkpoint")){
            var e=freshEvidence(id);var coverage=(tools.jackson.databind.node.ObjectNode)e.path("coverage");
            if(fault.equals("old"))coverage.put("asOf",Instant.now().minusSeconds(61).toString());
            if(fault.equals("unknown"))coverage.put("status","UNKNOWN");
            if(fault.equals("future"))coverage.put("asOf",Instant.now().plusSeconds(100).toString());
            if(fault.equals("checkpoint"))((tools.jackson.databind.node.ObjectNode)coverage.path("checkpoints").get(0)).put("checkedAt",Instant.now().minusSeconds(61).toString());
            if(fault.equals("gaps"))coverage.putArray("blockingGaps").addObject().put("reason","SOURCE_UNAVAILABLE");
            if(fault.equals("lag")){var cp=(tools.jackson.databind.node.ObjectNode)coverage.path("checkpoints").get(2);cp.put("committedSequence",0);cp.put("projectedSequence",0);}
            when(timelines.fetch(eq(id),eq(order),anyString(),isNull(),eq(100))).thenReturn(e);
            assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),revision(id))).getStatusCode(),fault);
        }
        when(timelines.fetch(any(),any(),anyString(),any(),anyInt())).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),revision(id)));
        assertEquals(0,count("admin_case_decisions"));assertEquals("UNDER_REVIEW",db.queryForObject("SELECT state FROM admin_cases WHERE id=?",String.class,id));
    }
    @Test void pendingUnknownAndUnexplainedRejectionsPreventResolution() {
        UUID id=reviewCase();evidence(id);UUID operation=operation(correction(id,UUID.randomUUID(),5));
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),revision(id))).getStatusCode());
        db.update("UPDATE admin_actions SET status='UNKNOWN' WHERE operation_id=?",operation);
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),revision(id))).getStatusCode());
        deliver(outcome(operation,false));
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),revision(id))).getStatusCode());
        var explanation=new ResolutionService.Explanation(operation,"Correction rejected; reviewed alternate evidence and no replacement needed");
        assertEquals(200,resolutions.resolve(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"Final review completed",revision(id),List.of(explanation)).status());
        assertTrue(db.queryForObject("SELECT rejected_action_explanations FROM admin_case_decisions",String.class).contains(explanation.explanation()));
    }
    @Test void actionDuringEvidenceReadInvalidatesResolutionAndConcurrentRetryCreatesOneDecision() throws Exception {
        UUID id=reviewCase();long version=revision(id);
        when(timelines.fetch(eq(id),eq(order),anyString(),isNull(),eq(100))).thenAnswer(call->{var e=freshEvidence(id);correction(id,UUID.randomUUID(),1);return e;});
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),version)).getStatusCode());
        assertEquals(0,count("admin_case_decisions"));deliver(outcome(db.queryForObject("SELECT operation_id FROM admin_actions",UUID.class),true));
        evidence(id);long current=revision(id);UUID key=UUID.randomUUID();
        var results=race(()->resolve(id,key,current),()->resolve(id,key,current));assertEquals(results.get(0),results.get(1));assertEquals(1,count("admin_case_decisions"));
    }
    @Test void resolutionRollsBackWhenAuditCannotCommitAndRevocationDuringEvidenceReadBlocksClosure(){
        UUID id=reviewCase();evidence(id);
        db.execute("ALTER TABLE admin_case_audit ADD CONSTRAINT test_resolution_audit CHECK (action<>'CASE_RESOLVED') NOT VALID");
        try{assertThrows(RuntimeException.class,()->resolve(id,UUID.randomUUID(),revision(id)));}
        finally{db.execute("ALTER TABLE admin_case_audit DROP CONSTRAINT test_resolution_audit");}
        assertEquals(0,count("admin_case_decisions"));assertEquals(2,count("admin_case_outbox"));
        when(timelines.fetch(eq(id),eq(order),anyString(),isNull(),eq(100))).thenAnswer(call->{var e=freshEvidence(id);when(users.find(reviewer)).thenReturn(new UserEligibilityClient.Eligibility(reviewer,true,false));return e;});
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->resolve(id,UUID.randomUUID(),revision(id))).getStatusCode());
        assertEquals(0,count("admin_case_decisions"));
    }
    long count(String table) { return db.queryForObject("SELECT count(*) FROM "+table,Long.class); }
    CaseViews.Mutation report(UUID actor, UUID key) { return service.report(jwt(actor,"REQUESTER"),key,order,"Pickup issue"); }

    CaseViews.Mutation correction(UUID id,UUID key,int amount){return creditActions.create(jwt(reviewer,"ADMIN"),id,key,"CREDIT_ADJUSTMENT",reporter,json.valueToTree(amount),"  Case correction  ");}
    UUID operation(CaseViews.Mutation result){return UUID.fromString(json.readTree(result.body()).path("operationId").asText());}
    @SuppressWarnings("unchecked") Map<String,Object> outcome(UUID operation,boolean success){
        var a=db.queryForMap("SELECT * FROM admin_actions WHERE operation_id=?",operation);
        Map<String,Object> data=new LinkedHashMap<>();data.put("operationId",operation);data.put("caseId",a.get("case_id"));data.put("orderId",order);data.put("targetUserId",reporter);data.put("requestedBy",reviewer);data.put("amount",a.get("amount"));data.put("completedAt","2026-10-30T10:00:00Z");data.put("result",success?"APPLIED":"REJECTED");
        if(success){data.put("availableBalance",12);data.put("reservedBalance",7);data.put("ledgerEntryId",UUID.randomUUID());}else data.put("reasonCode","INSUFFICIENT_AVAILABLE_CREDITS");
        return CreditActionService.envelope(UUID.randomUUID(),success?"AdminCreditCorrectionApplied":"AdminCreditCorrectionRejected","AdminAction",reporter,1,Instant.now(),"credit-service",(UUID)a.get("correlation_id"),(UUID)a.get("command_event_id"),reviewer,data);
    }
    void deliver(Map<String,Object> outcome){creditActions.outcome(reporter.toString(),json.writeValueAsString(outcome));}
    @Test void correctionIsAtomicAndRetriesReturnOneOperationAndOriginalCommand(){
        UUID id=reviewCase(),key=UUID.randomUUID();var accepted=correction(id,key,5);assertEquals(202,accepted.status());assertEquals(accepted,correction(id,key,5));
        assertEquals(1,count("admin_actions"));assertEquals(1,count("admin_action_outbox"));assertEquals(3,count("admin_case_audit"));
        var command=json.readTree(db.queryForObject("SELECT payload FROM admin_action_outbox",String.class));
        assertEquals("AdminCreditCorrectionRequested",command.path("eventType").asText());assertEquals("Case correction",command.path("data").path("reason").asText());assertEquals(3,command.path("data").path("caseRevision").asLong());
        assertThrows(ResponseStatusException.class,()->correction(id,key,-5));assertEquals(1,count("admin_actions"));
        db.update("UPDATE admin_cases SET state='RESOLVED' WHERE id=?",id);assertEquals(accepted,correction(id,key,5));
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->correction(id,UUID.randomUUID(),5)).getStatusCode());
    }
    @Test void correctionRequiresReviewerParticipantAndStrictWholeAmount(){
        UUID id=reviewCase();
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(courier,"ADMIN"),id,UUID.randomUUID(),"CREDIT_ADJUSTMENT",reporter,json.valueToTree(5),"Reason")).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"CREDIT_ADJUSTMENT",courier,json.valueToTree(5),"Reason")).getStatusCode());
        for(String input:List.of("0","1.5","2147483648","\"5\"","null"))assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"CREDIT_ADJUSTMENT",reporter,json.readTree(input),"Reason"));
        assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"BAN",reporter,json.valueToTree(5),"Reason"));
        assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"CREDIT_ADJUSTMENT",reporter,json.valueToTree(5)," "));
        when(users.find(reviewer)).thenReturn(new UserEligibilityClient.Eligibility(reviewer,false,true));assertThrows(ResponseStatusException.class,()->correction(id,UUID.randomUUID(),5));assertEquals(0,count("admin_actions"));
    }
    @Test void actionOutboxFailureRollsBackActionReceiptAuditAndRevision(){
        UUID id=reviewCase();db.execute("ALTER TABLE admin_action_outbox ADD CONSTRAINT test_command_failure CHECK (false)");
        try{assertThrows(Exception.class,()->correction(id,UUID.randomUUID(),5));assertEquals(0,count("admin_actions"));assertEquals(2,count("admin_case_audit"));assertEquals(2,service.detail(jwt(reviewer,"ADMIN"),id).caseSummary().revision());}
        finally{db.execute("ALTER TABLE admin_action_outbox DROP CONSTRAINT test_command_failure");}
    }
    @Test void concurrentIdenticalCorrectionSubmissionsHaveOneOutboxAndOperation()throws Exception{
        UUID id=reviewCase(),key=UUID.randomUUID();var results=race(()->correction(id,key,5),()->correction(id,key,5));assertEquals(results.get(0),results.get(1));assertEquals(1,count("admin_actions"));assertEquals(1,count("admin_action_outbox"));
    }
    @Test void overdueActionRemainsUnknownUntilMatchingLateOutcomeAndCannotBeReversed()throws Exception{
        UUID id=reviewCase();var accepted=correction(id,UUID.randomUUID(),5);UUID op=operation(accepted);
        db.update("UPDATE admin_actions SET deadline_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE operation_id=?",op);
        assertEquals("UNKNOWN",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());
        var result=outcome(op,true);deliver(result);deliver(result);
        assertEquals("SUCCEEDED",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());assertEquals(1,count("admin_action_inbox"));assertEquals(4,count("admin_case_audit"));assertEquals(3,count("admin_case_outbox"));
        var export=exports.read(order,id,null,20);assertEquals(3,export.records().size());assertEquals(op.toString(),export.records().get(2).path("data").path("operationId").asText());
        // Generated test-only artifacts permit external validation against the unmodified draft schemas.
        var samples=java.nio.file.Path.of("target","credit-action-contract-samples");java.nio.file.Files.createDirectories(samples);
        java.nio.file.Files.writeString(samples.resolve("command.json"),db.queryForObject("SELECT payload FROM admin_action_outbox WHERE operation_id=?",String.class,op));
        java.nio.file.Files.writeString(samples.resolve("action.json"),accepted.body());
        java.nio.file.Files.writeString(samples.resolve("outcome-test-only.json"),json.writeValueAsString(result));
        java.nio.file.Files.writeString(samples.resolve("completion.json"),db.queryForObject("SELECT payload FROM admin_case_outbox WHERE event_type='CaseActionCompleted'",String.class));
        java.nio.file.Files.writeString(samples.resolve("export.json"),json.writeValueAsString(export));
        result.put("eventId",UUID.randomUUID());deliver(result);assertEquals(2,count("admin_action_inbox"));assertEquals(4,count("admin_case_audit"));
        deliver(outcome(op,false));assertEquals("SUCCEEDED",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());assertEquals(1,count("admin_action_quarantine"));
    }
    @SuppressWarnings("unchecked") @Test void malformedMismatchedAndConflictingOutcomesNeverInventARejection(){
        UUID id=reviewCase(),op=operation(correction(id,UUID.randomUUID(),-5));var result=outcome(op,true);
        var data=(Map<String,Object>)result.get("data");data.put("amount",6);deliver(result);
        assertEquals("PENDING",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());assertEquals(0,count("admin_action_inbox"));
        data.put("amount",-5);result.put("producer","admin-service");deliver(result);result.put("producer","credit-service");
        creditActions.outcome(courier.toString(),json.writeValueAsString(result));
        creditActions.outcome(reporter.toString(),"not json");
        assertEquals(4,count("admin_action_quarantine"));assertEquals("PENDING",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());
        deliver(outcome(op,false));assertEquals("REJECTED",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());assertEquals("INSUFFICIENT_AVAILABLE_CREDITS",creditActions.read(jwt(reviewer,"ADMIN"),id,op).reasonCode());
    }
    @Test void outcomeCommitFailureRollsBackInboxAndTerminalResult(){
        UUID id=reviewCase(),op=operation(correction(id,UUID.randomUUID(),5));var result=outcome(op,true);
        db.execute("ALTER TABLE admin_case_outbox ADD CONSTRAINT test_completion_failure CHECK (event_type<>'CaseActionCompleted')");
        try{assertThrows(Exception.class,()->deliver(result));assertEquals(0,count("admin_action_inbox"));assertEquals("PENDING",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());}
        finally{db.execute("ALTER TABLE admin_case_outbox DROP CONSTRAINT test_completion_failure");}
        deliver(result);assertEquals("SUCCEEDED",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());
    }
    @Test void deliveryLeasesRecoverWithoutChangingCommandIdentityAndStopAfterOutcome(){
        UUID id=reviewCase(),op=operation(correction(id,UUID.randomUUID(),5));var first=deliveries.claim().get(0);assertTrue(deliveries.claim().isEmpty());deliveries.failed(first);
        db.update("UPDATE admin_action_outbox SET next_attempt_at=CURRENT_TIMESTAMP-INTERVAL '1 second'");
        var retry=deliveries.claim().get(0);assertEquals(first.eventId(),retry.eventId());assertEquals(first.payload(),retry.payload());assertNotEquals(first.lease(),retry.lease());
        deliveries.confirmed(retry,10);assertTrue(deliveries.claim().isEmpty());
        db.update("UPDATE admin_action_outbox SET next_attempt_at=CURRENT_TIMESTAMP-INTERVAL '1 second'");assertEquals(first.eventId(),deliveries.claim().get(0).eventId());
        db.update("UPDATE admin_action_outbox SET lease_until=CURRENT_TIMESTAMP-INTERVAL '1 second'");assertEquals(first.payload(),deliveries.claim().get(0).payload());
        deliver(outcome(op,false));assertTrue(deliveries.claim().isEmpty());
    }

    UUID reviewCase() {
        UUID id=caseId(report(reporter,UUID.randomUUID()));
        service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,1);
        return id;
    }
    ChatConversationClient.Conversation reference(UUID id) { return new ChatConversationClient.Conversation(UUID.randomUUID(),id,order,reporter,false); }
    @Test void onlyAssignedReviewerCanInitiateForVerifiedReportingParticipants() {
        UUID id=caseId(report(reporter,UUID.randomUUID()));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,reporter)).getStatusCode());
        service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,1);
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(courier,"ADMIN"),UUID.randomUUID(),id,reporter)).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(reviewer,"COURIER"),UUID.randomUUID(),id,reporter)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,courier)).getStatusCode());
        verifyNoInteractions(conversations);
    }
    @Test void conversationRetriesRetainIdentityAndAuditEachReferenceOnlyOnce() {
        UUID id=reviewCase(), key=UUID.randomUUID(); var ref=reference(id);
        when(conversations.open(eq(id),eq(order),eq(reporter),any(),any())).thenReturn(ref);
        var first=service.openConversation(jwt(reviewer,"ADMIN"),key,id,reporter);
        assertEquals(200,first.status()); assertEquals(first,service.openConversation(jwt(reviewer,"ADMIN"),key,id,reporter));
        verify(conversations,times(1)).open(id,order,reporter,key,"actor-jwt");
        assertEquals(first,service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,reporter));
        assertEquals(1,count("admin_case_conversations")); assertEquals(3,count("admin_case_audit")); assertEquals(2,count("admin_case_outbox"));
        assertEquals(3,service.detail(jwt(reviewer,"ADMIN"),id).caseSummary().revision());
        assertEquals(409,service.claim(jwt(reviewer,"ADMIN"),key,id,3).status());
    }
    @Test void uncertainInitiationRetriesOriginalKeyAfterChatOutage() {
        UUID id=reviewCase(),key=UUID.randomUUID();var ref=reference(id);
        when(conversations.open(id,order,reporter,key,"actor-jwt")).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)).thenReturn(ref);
        assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(reviewer,"ADMIN"),key,id,reporter));
        assertEquals(0,count("admin_case_conversations"));
        assertEquals(503,db.queryForObject("SELECT response_status FROM admin_mutation_receipts WHERE idempotency_key=?",Integer.class,key));
        assertEquals(200,service.openConversation(jwt(reviewer,"ADMIN"),key,id,reporter).status());
        verify(conversations,times(2)).open(id,order,reporter,key,"actor-jwt");
    }
    @Test void conflictingConversationReferenceOrReusedKeyCannotChangeTargetOrAudit() {
        UUID id=reviewCase(),key=UUID.randomUUID();var original=reference(id);
        service.report(jwt(courier,"COURIER"),UUID.randomUUID(),order,"Historical courier statement");
        when(conversations.open(eq(id),eq(order),eq(reporter),any(),any())).thenReturn(original);
        assertEquals(200,service.openConversation(jwt(reviewer,"ADMIN"),key,id,reporter).status());
        assertEquals(409,service.openConversation(jwt(reviewer,"ADMIN"),key,id,courier).status());
        verify(conversations,never()).open(eq(id),eq(order),eq(courier),any(),any());
        when(conversations.open(eq(id),eq(order),eq(reporter),any(),any())).thenReturn(reference(id));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,reporter)).getStatusCode());
        assertEquals(original.conversationId(),db.queryForObject("SELECT conversation_id FROM admin_case_conversations",UUID.class));
        assertEquals(4,count("admin_case_audit"));
    }
    @Test void revocationOrClosureDuringChatCallPreventsDisclosureAndConfirmation() {
        UUID id=reviewCase(),key=UUID.randomUUID();var ref=reference(id);
        when(conversations.open(eq(id),eq(order),eq(reporter),any(),any())).thenAnswer(call->{
            when(users.find(reviewer)).thenReturn(new UserEligibilityClient.Eligibility(reviewer,true,false));return ref;});
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(reviewer,"ADMIN"),key,id,reporter)).getStatusCode());
        assertEquals(0,count("admin_case_conversations"));
        when(users.find(reviewer)).thenReturn(new UserEligibilityClient.Eligibility(reviewer,true,true));
        when(conversations.open(eq(id),eq(order),eq(reporter),any(),any())).thenAnswer(call->{db.update("UPDATE admin_cases SET state='RESOLVED' WHERE id=?",id);return ref;});
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->service.openConversation(jwt(reviewer,"ADMIN"),key,id,reporter)).getStatusCode());
        assertEquals(0,count("admin_case_conversations"));assertEquals(2,count("admin_case_audit"));
    }
    @Test void concurrentInitiationHasOneReferenceAndOneAuditDespiteMultipleRequestKeys() throws Exception {
        UUID id=reviewCase();var ref=reference(id);
        when(conversations.open(eq(id),eq(order),eq(reporter),any(),any())).thenReturn(ref);
        var pool=Executors.newFixedThreadPool(2);
        try {
            var results=pool.invokeAll(List.of(
                ()->service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,reporter),
                ()->service.openConversation(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,reporter)));
            for(var result:results)assertEquals(200,((CaseViews.Mutation)result.get()).status());
        } finally {pool.shutdownNow();}
        assertEquals(1,count("admin_case_conversations"));assertEquals(3,count("admin_case_audit"));
    }

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
    @Test void evidenceExportPinsSnapshotPreservesIdsAndExcludesPrivateStatements() {
        UUID id=caseId(report(reporter,UUID.randomUUID()));
        service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,1);
        var first=exports.read(order,id,null,1);
        assertEquals(2,first.checkpoint().committedSequence());assertNotNull(first.nextCursor());assertEquals(1,first.records().size());
        UUID event=db.queryForObject("SELECT event_id FROM admin_case_outbox WHERE case_id=? AND source_sequence=1",UUID.class,id);
        assertEquals(event.toString(),first.records().get(0).path("eventId").asText());
        assertFalse(json.writeValueAsString(first).contains("Pickup issue"));
        var second=exports.read(order,id,first.nextCursor(),1);
        assertEquals(first.snapshotId(),second.snapshotId());assertEquals(first.checkpoint(),second.checkpoint());assertNull(second.nextCursor());
        assertEquals("CaseClaimed",second.records().get(0).path("action").asText());assertEquals(2,second.records().get(0).path("sourceSequence").asLong());
        assertEquals(second,exports.read(order,id,first.nextCursor(),1));
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->exports.read(order,id,first.nextCursor(),2)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,()->exports.read(UUID.randomUUID(),id,first.nextCursor(),1)).getStatusCode());
    }
    @Test void evidenceExportSnapshotDoesNotChangeWhenClaimCommitsAfterFirstRead() {
        UUID id=caseId(report(reporter,UUID.randomUUID()));var before=exports.read(order,id,null,1);
        assertNull(before.nextCursor());assertEquals(1,before.checkpoint().committedSequence());
        service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,1);var after=exports.read(order,id,null,1);
        assertNotEquals(before.snapshotId(),after.snapshotId());assertEquals(2,after.checkpoint().committedSequence());
        assertEquals(1,before.checkpoint().committedSequence());assertEquals(before.records().get(0),after.records().get(0));
    }
    @Test void evidenceRecoveryDoesNotInventLegacyBaselineOrHideMissingEvents() {
        UUID legacy=UUID.randomUUID(),legacyOrder=UUID.randomUUID();
        db.update("INSERT INTO admin_cases(id,order_id,state,revision) VALUES (?,?,'OPEN',0)",legacy,legacyOrder);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->exports.read(legacyOrder,legacy,null,20)).getStatusCode());
        UUID id=caseId(report(reporter,UUID.randomUUID()));service.claim(jwt(reviewer,"ADMIN"),UUID.randomUUID(),id,1);
        db.update("DELETE FROM admin_case_outbox WHERE case_id=? AND source_sequence=1",id);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ResponseStatusException.class,()->exports.read(order,id,null,20)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->exports.read(order,id,"bad-cursor",20)).getStatusCode());
        assertEquals(HttpStatus.CONFLICT,assertThrows(ResponseStatusException.class,()->exports.read(order,id,UUID.randomUUID().toString(),20)).getStatusCode());
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
    @Test void banUsesSharedTrackingButPublishesOnlyAUserCommandWithoutACreditAmount(){
        UUID id=reviewCase(),key=UUID.randomUUID();
        var accepted=creditActions.create(jwt(reviewer,"ADMIN"),id,key,"BAN",reporter,null,"  Case ban reason  ");
        assertEquals(accepted,creditActions.create(jwt(reviewer,"ADMIN"),id,key,"BAN",reporter,null,"Case ban reason"));
        var body=json.readTree(accepted.body());assertEquals("BAN",body.path("type").asText());assertTrue(body.path("amount").isNull());
        var delivery=deliveries.claim().get(0);assertEquals("admin.user.commands",delivery.topic());
        var command=json.readTree(delivery.payload());assertEquals("AdminUserBanRequested",command.path("eventType").asText());
        assertFalse(command.path("data").has("amount"));assertEquals("Case ban reason",command.path("data").path("reason").asText());
        assertEquals(1,count("admin_actions"));assertEquals(1,count("admin_action_outbox"));
        assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,key,"CREDIT_ADJUSTMENT",reporter,json.valueToTree(1),"Case ban reason"));
    }
    @Test void banStillRequiresCurrentAssignedReviewerEligibleTargetAndReason(){
        UUID id=reviewCase();
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(courier,"ADMIN"),id,UUID.randomUUID(),"BAN",reporter,null,"Reason")).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"REQUESTER"),id,UUID.randomUUID(),"BAN",reporter,null,"Reason")).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"BAN",reporter,json.valueToTree(5),"Reason")).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"BAN",reporter,null," ")).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ResponseStatusException.class,()->creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"BAN",UUID.randomUUID(),null,"Reason")).getStatusCode());
        assertEquals(0,count("admin_actions"));
    }
    @Test void onlyMatchingUserOutcomesCanFinishABanAndNoChangeIsSuccess(){
        UUID id=reviewCase();UUID op=operation(creditActions.create(jwt(reviewer,"ADMIN"),id,UUID.randomUUID(),"BAN",reporter,null,"Reviewed case"));
        var a=db.queryForMap("SELECT * FROM admin_actions WHERE operation_id=?",op);
        Map<String,Object> data=new LinkedHashMap<>();data.put("operationId",op);data.put("caseId",id);data.put("orderId",order);data.put("targetUserId",reporter);data.put("requestedBy",reviewer);data.put("completedAt",Instant.now().toString());data.put("result","NO_CHANGE");data.put("previousStatus","BANNED");data.put("status","BANNED");
        var event=CreditActionService.envelope(UUID.randomUUID(),"AdminUserBanApplied","AdminAction",reporter,1,Instant.now(),"user-service",(UUID)a.get("correlation_id"),(UUID)a.get("command_event_id"),reviewer,data);
        String wire=json.writeValueAsString(event);
        assertFalse(creditActions.outcome(reporter.toString(),wire)); // Credit's subscription cannot accept User events.
        assertTrue(creditActions.outcome(reporter.toString(),wire,"user-service"));
        assertTrue(creditActions.outcome(reporter.toString(),wire,"user-service"));
        assertEquals("SUCCEEDED",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());
        assertEquals(1,count("admin_action_inbox"));assertEquals(1,db.queryForObject("SELECT count(*) FROM admin_case_outbox WHERE event_type='CaseActionCompleted'",Integer.class));
        assertTrue(exports.read(order,id,null,20).records().stream().anyMatch(record->"NO_CHANGE".equals(record.path("data").path("result").asText())));
        event.put("eventId",UUID.randomUUID());data.put("result","APPLIED");data.put("previousStatus","ACTIVE");
        assertFalse(creditActions.outcome(reporter.toString(),json.writeValueAsString(event),"user-service"));
        assertEquals("SUCCEEDED",creditActions.read(jwt(reviewer,"ADMIN"),id,op).status());
    }

}
