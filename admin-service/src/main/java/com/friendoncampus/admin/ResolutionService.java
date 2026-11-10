package com.friendoncampus.admin;

import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** No remote calls under the case lock. All closure facts and the original receipt commit together. */
@Service
public class ResolutionService {
    public record Explanation(UUID operationId, String explanation) { }
    private final JdbcTemplate db;
    private DisputeOrderClient reviewOrders;
    @org.springframework.beans.factory.annotation.Autowired public void reviewOrders(DisputeOrderClient client){this.reviewOrders=client;}
    private final CaseService cases;
    private final TimelineService timeline;
    private final ChatConversationClient chat;
    private final TransactionTemplate tx;
    private final long maxAge;
    private final ReviewerIndependenceService independence;
    private final JsonMapper json=JsonMapper.builder().build();
    public ResolutionService(JdbcTemplate db, CaseService cases, TimelineService timeline,
            PlatformTransactionManager manager, ChatConversationClient chat, @Value("${app.resolution.evidence-max-age-seconds:60}") long maxAge, ReviewerIndependenceService independence) {
        if(maxAge<1)throw new IllegalArgumentException("Evidence age must be positive");
        this.db=db;this.cases=cases;this.timeline=timeline;this.maxAge=maxAge;this.chat=chat;
        this.independence=independence;
        tx=new TransactionTemplate(manager);tx.setTimeout(15);
    }
    public CaseViews.Mutation resolve(Jwt actor, UUID id, UUID key, String resolution, long revision, List<Explanation> explanations) {
        return resolve(actor,id,key,resolution,revision,explanations,"KEEP_EXISTING");
    }
    public CaseViews.Mutation resolve(Jwt actor,UUID id,UUID key,String resolution,long revision,List<Explanation> explanations,String disposition){
        var initial=cases.evidenceCase(actor,id);
        UUID reviewer=UUID.fromString(actor.getSubject());
        String reason=resolution==null?"":resolution.strip();
        if(disposition==null||!Set.of("RETURN_TO_REQUESTER","PAY_COURIER","KEEP_EXISTING").contains(disposition))throw error(400,"Choose the reserved-credit outcome.");
        if(key==null||revision<0||reason.isEmpty()||reason.length()>2000)throw error(400,"Provide a resolution of 1–2000 characters, a revision and a request key.");
        SortedMap<String,String> rejected=new TreeMap<>();
        if(explanations!=null)for(var e:explanations){
            if(e==null||e.operationId()==null||e.explanation()==null||e.explanation().isBlank()||e.explanation().strip().length()>2000||rejected.put(e.operationId().toString(),e.explanation().strip())!=null)
                throw error(400,"Provide one nonblank explanation per rejected action, without duplicates.");
        }
        String route="/api/admin/cases/"+id+"/resolve";
        String currentHash=CreditActionService.hash(json.writeValueAsString(List.of(reason,revision,rejected,disposition)));
        String legacyHash=CreditActionService.hash(json.writeValueAsString(List.of(reason,revision,rejected)));
        boolean legacy="KEEP_EXISTING".equals(disposition)&&Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_mutation_receipts WHERE idempotency_key=? AND actor_id=? AND route=? AND request_hash=?)",Boolean.class,key,reviewer,route,legacyHash));
        final String hash=legacy?legacyHash:currentHash;
        var previous=receipt(key,reviewer,route,hash);
        if(previous!=null&&previous.status()!=503)return previous; // Completed replays never depend on Chat again.
        eligible(initial,reviewer,revision);
        if(previous==null){reviewOrders.freeze(initial.orderId(),id,actor.getTokenValue());chat.prepareErrandReview(initial.orderId(),id,actor.getTokenValue());}
        if(previous==null)reviewOrders.validate(initial.orderId(),id,disposition,actor.getTokenValue());
        final var evidence=timeline.read(actor,id,null,100); // Real producer read, never browser coverage.
        cases.evidenceCase(actor,id); // Recheck current User eligibility after remote work.
        independence.require(id,initial.orderId(),reviewer);
        boolean continueResolution=Boolean.TRUE.equals(tx.execute(s->{
            db.execute("SET LOCAL lock_timeout='5s'");
            db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"request:"+key);
            var completed=receipt(key,reviewer,route,hash);
            if(completed!=null&&completed.status()!=503)return false;
            var rows=db.queryForList("SELECT * FROM admin_cases WHERE id=? FOR UPDATE",id);
            if(rows.isEmpty())throw error(404,"Case not found.");var c=rows.get(0);
            independence.require(id,(UUID)c.get("order_id"),reviewer);
            eligible(new CaseViews.Summary(id,(UUID)c.get("order_id"),AdminCase.State.valueOf((String)c.get("state")),(UUID)c.get("reviewer_id"),((Number)c.get("revision")).longValue(),initial.createdAt()),reviewer,revision);
            var preparations=db.queryForList("SELECT operation_id,actor_id,request_hash FROM admin_resolution_preparations WHERE case_id=?",id);
            if(!preparations.isEmpty()){
                var p=preparations.get(0);
                if(!key.equals(p.get("operation_id"))||!reviewer.equals(p.get("actor_id"))||!hash.equals(p.get("request_hash")))throw error(409,"Resume the original prepared resolution with its original request key and body.");
            }else{
                if(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_mutation_receipts WHERE idempotency_key=?)",Boolean.class,key))throw error(409,"This request key belongs to a different request.");
                validateActions(id,rejected.keySet());
                validateEvidence(evidence,id,(UUID)c.get("order_id"),((Number)c.get("source_sequence")).longValue());
                db.update("INSERT INTO admin_resolution_preparations(operation_id,case_id,actor_id,request_hash,resolution,case_revision,explanations,credit_disposition) VALUES (?,?,?,?,?,?,?,?)",key,id,reviewer,hash,reason,revision,json.writeValueAsString(rejected),disposition);
                db.update("UPDATE admin_cases SET closure_operation_id=? WHERE id=?",key,id);
                db.update("INSERT INTO admin_mutation_receipts(idempotency_key,actor_id,route,request_hash,response_status,response_body) VALUES (?,?,?,?,503,?)",key,reviewer,route,hash,json.writeValueAsString(Map.of("detail","Resolution preparation is pending. Retry the same operation.")));
            }
            return true;
        }));
        if(!continueResolution)return receipt(key,reviewer,route,hash);
        chat.prepareClosure(id,key,actor.getTokenValue()); // Remote drain acknowledgement, outside Admin locks.
        reviewOrders.finish(initial.orderId(),id,key,disposition,actor.getTokenValue());
        final var finalEvidence=timeline.read(actor,id,null,100);
        cases.evidenceCase(actor,id);
        return tx.execute(s->{
            db.execute("SET LOCAL lock_timeout='5s'");
            db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"request:"+key);
            var replay=receipt(key,reviewer,route,hash);if(replay!=null&&replay.status()!=503)return replay;
            var rows=db.queryForList("SELECT * FROM admin_cases WHERE id=? FOR UPDATE",id);
            if(rows.isEmpty())throw error(404,"Case not found.");
            var c=rows.get(0);
            independence.require(id,(UUID)c.get("order_id"),reviewer);
            eligible(new CaseViews.Summary(id,(UUID)c.get("order_id"),AdminCase.State.valueOf((String)c.get("state")),(UUID)c.get("reviewer_id"),((Number)c.get("revision")).longValue(),initial.createdAt()),reviewer,revision);
            var actions=db.queryForList("SELECT operation_id,status FROM admin_actions WHERE case_id=?",id);
            Set<String> required=new HashSet<>();
            for(var action:actions){
                if(Set.of("PENDING","UNKNOWN").contains(action.get("status")))throw error(409,"This case has pending or unknown actions. Wait for owner confirmation before resolving.");
                if("REJECTED".equals(action.get("status")))required.add(action.get("operation_id").toString());
            }
            if(!required.equals(rejected.keySet()))throw error(400,"Explain every rejected action and only rejected actions before resolving.");
            validateEvidence(finalEvidence,id,(UUID)c.get("order_id"),((Number)c.get("source_sequence")).longValue());
            Instant now=Instant.now();long next=revision+1,sequence=((Number)c.get("source_sequence")).longValue()+1;
            db.update("INSERT INTO admin_case_decisions(case_id,reviewer_id,resolution,rejected_action_explanations,evidence_revision,evidence_coverage,resolved_at,case_revision) VALUES (?,?,?,?,?,?,?,?)",
                id,reviewer,reason,json.writeValueAsString(rejected),finalEvidence.path("evidenceRevision").asText(),json.writeValueAsString(finalEvidence.path("coverage")),now.atOffset(ZoneOffset.UTC),next);
            db.update("UPDATE admin_cases SET state='RESOLVED',revision=?,source_sequence=? WHERE id=?",next,sequence,id);
            db.update("INSERT INTO admin_case_audit(id,case_id,case_revision,actor_id,action,occurred_at) VALUES (?,?,?,?,'CASE_RESOLVED',?)",UUID.randomUUID(),id,next,reviewer,now.atOffset(ZoneOffset.UTC));
            UUID event=UUID.randomUUID();
            Map<String,Object> data=Map.of("caseId",id,"orderId",c.get("order_id"),"sourceSequence",sequence,"reviewerId",reviewer,"resolvedAt",now.toString());
            var envelope=CreditActionService.envelope(event,"CaseResolved","AdminCase",id,next,now,"admin-service",(UUID)c.get("correlation_id"),null,reviewer,data);
            db.update("INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES (?,?,?,'CaseResolved','admin.events',?,?)",event,id,sequence,json.writeValueAsString(envelope),now.atOffset(ZoneOffset.UTC));
            String body=json.writeValueAsString(cases.localDetail(id));
            db.update("UPDATE admin_mutation_receipts SET response_status=200,response_body=? WHERE idempotency_key=?",body,key);
            return new CaseViews.Mutation(200,body);
        });
    }
    private void validateActions(UUID id,Set<String> explanations){
        Set<String> required=new HashSet<>();
        for(var action:db.queryForList("SELECT operation_id,status FROM admin_actions WHERE case_id=?",id)){
            if(Set.of("PENDING","UNKNOWN").contains(action.get("status")))throw error(409,"This case has pending or unknown actions. Wait for owner confirmation before resolving.");
            if("REJECTED".equals(action.get("status")))required.add(action.get("operation_id").toString());
        }
        if(!required.equals(explanations))throw error(400,"Explain every rejected action and only rejected actions before resolving.");
    }
    private void validateEvidence(JsonNode e,UUID id,UUID order,long sequence){
        try{
            EvidenceValidation.timeline(e,id,order);
            if(!"COMPLETE".equals(e.path("coverage").path("status").asText())||!e.path("coverage").path("blockingGaps").isEmpty())throw new IllegalArgumentException();
            Instant now=Instant.now(),floor=now.minusSeconds(maxAge);
            checkTime(e.path("coverage").path("asOf").asText(),floor,now);
            boolean covered=false;
            for(var cp:e.path("coverage").path("checkpoints")){
                checkTime(cp.path("checkedAt").asText(),floor,now);
                if("admin-service".equals(cp.path("source").asText())&&"admin.events".equals(cp.path("stream").asText())&&id.toString().equals(cp.path("aggregateId").asText()))
                    covered=cp.path("committedSequence").asLong()>=sequence&&cp.path("projectedSequence").asLong()>=sequence;
            }
            if(!covered)throw new IllegalArgumentException();
        }catch(Exception ex){throw error(503,"Fresh complete Chat evidence is required. Evidence is unavailable, stale, has blocking gaps, or does not cover the current case. The case remains open.");}
    }
    private static void checkTime(String value,Instant floor,Instant now){Instant t=Instant.parse(value);if(t.isBefore(floor)||t.isAfter(now.plusSeconds(5)))throw new IllegalArgumentException();}
    private void eligible(CaseViews.Summary c,UUID actor,long revision){
        if(!actor.equals(c.reviewerId()))throw error(403,"Only the assigned reviewer can resolve this case.");
        if(c.state()!=AdminCase.State.UNDER_REVIEW||c.revision()!=revision)throw error(409,"This case has changed or is already resolved. Refresh before resolving.");
    }
    private CaseViews.Mutation receipt(UUID key,UUID actor,String route,String hash){
        return db.query("SELECT * FROM admin_mutation_receipts WHERE idempotency_key=?",r->{
            if(!r.next())return null;
            if(!actor.equals(r.getObject("actor_id",UUID.class))||!route.equals(r.getString("route"))||!hash.equals(r.getString("request_hash")))throw error(409,"This request key belongs to a different request.");
            return new CaseViews.Mutation(r.getInt("response_status"),r.getString("response_body"));
        },key);
    }
    private static ResponseStatusException error(int status,String text){return new ResponseStatusException(HttpStatus.valueOf(status),text);}
}
