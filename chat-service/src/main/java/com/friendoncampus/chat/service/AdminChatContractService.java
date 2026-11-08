package com.friendoncampus.chat.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AdminChatContractService {
    private final JdbcClient db; private final Clock clock; private final JwtDecoder users;
    private final InternalServiceClient internal; private final JsonMapper json=JsonMapper.builder().build();
    public AdminChatContractService(JdbcClient db,Clock clock,JwtDecoder userJwtDecoder,InternalServiceClient internal){
        this.db=db;this.clock=clock;this.users=userJwtDecoder;this.internal=internal;
    }
    public Jwt actor(String raw){
        if(raw==null||raw.isBlank())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"A user token is required");
        try{return users.decode(raw.startsWith("Bearer ")?raw.substring(7):raw);}catch(Exception ex){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"A valid user token is required");}
    }
    @Transactional
    public Map<String,Object> eligibility(UUID orderId,UUID userId,Jwt actor){
        UUID actorId=UUID.fromString(actor.getSubject());if(!actorId.equals(userId))throw hidden();
        String role=actor.getClaimAsString("role");if(!Set.of("REQUESTER","COURIER").contains(role))throw hidden();
        reconcile(internal.orderEvidence(orderId));var evidence=orderEvidence(orderId);boolean participant=evidence.stream().anyMatch(r->{JsonNode d=r.data();return userId.toString().equals(d.path("requesterId").asText())||userId.toString().equals(d.path("courierId").asText())||userId.toString().equals(d.path("previousCourierId").asText());});
        JsonNode account=internal.userEligibility(userId);boolean eligible=participant&&account.path("active").asBoolean(false);
        return response(orderId,userId,eligible,evidence);
    }
    @Transactional
    public Map<String,Object> timeline(UUID caseId,Jwt actor,String cursor,int limit){
        requireAdmin(actor);if(limit<1||limit>100)throw bad("Limit must be between 1 and 100");
        UUID actorId=UUID.fromString(actor.getSubject());JsonNode access=internal.caseAccess(caseId,actorId,null);
        if(!access.path("canReadEvidence").asBoolean())throw hidden();UUID orderId=UUID.fromString(access.path("orderId").asText());
        reconcile(internal.orderEvidence(orderId));reconcile(internal.creditEvidence(orderId));reconcile(internal.adminEvidence(orderId,caseId));
        List<Record> all=allEvidence(orderId);List<Record> orderRecords=all.stream().filter(r->"ORDER".equals(r.data().path("kind").asText())).toList();int offset=cursor==null?0:decodeCursor(cursor,revision(all));
        int end=Math.min(offset+limit,all.size());List<Map<String,Object>> records=all.subList(offset,end).stream().map(Record::wire).toList();
        JsonNode snapshot=orderRecords.isEmpty()?json.createObjectNode():orderRecords.get(orderRecords.size()-1).data().path("snapshot");
        if(snapshot.isMissingNode()||!snapshot.isObject())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Order evidence baseline is unavailable");
        String revision=revision(all);String next=end<all.size()?encodeCursor(revision,end):null;
        Map<String,Object> result=new LinkedHashMap<>();result.put("caseId",caseId);result.put("orderId",orderId);result.put("evidenceRevision",revision);
        result.put("order",json.convertValue(snapshot,Map.class));result.put("participants",participants(orderRecords));result.put("records",records);
        result.put("coverage",coverage(orderId,caseId,all));result.put("nextCursor",next);return result;
    }
    @Transactional
    public Map<String,Object> openConversation(UUID caseId,UUID participantId,UUID key,Jwt actor){
        requireAdmin(actor);UUID actorId=UUID.fromString(actor.getSubject());JsonNode access=internal.caseAccess(caseId,actorId,participantId);
        if(!access.path("canReadConversation").asBoolean())throw hidden();UUID orderId=UUID.fromString(access.path("orderId").asText());
        String requestHash=sha256(participantId.toString());
        var prior=db.sql("SELECT request_hash,conversation_id FROM chat_case_conversation_requests WHERE case_id=:caseId AND idempotency_key=:key")
                .param("caseId",caseId).param("key",key).query((rs,n)->Map.of("hash",rs.getString(1),"id",rs.getObject(2,UUID.class))).optional();
        UUID conversationId;
        if(prior.isPresent()){
            if(!requestHash.equals(prior.get().get("hash")))throw new ChatConflictException("Idempotency-Key was already used for another participant");
            conversationId=(UUID)prior.get().get("id");
        }else{
            conversationId=db.sql("SELECT id FROM chat_conversations WHERE case_id=:caseId AND case_participant_id=:participant")
                    .param("caseId",caseId).param("participant",participantId).query(UUID.class).optional().orElse(null);
            boolean writable=access.path("canWriteConversation").asBoolean();OffsetDateTime now=OffsetDateTime.now(clock);
            if(conversationId==null){conversationId=UUID.randomUUID();db.sql("INSERT INTO chat_conversations(id,conversation_type,order_id,case_id,case_participant_id,status,next_sequence,created_at,updated_at) VALUES(:id,'CASE',:orderId,:caseId,:participant,:status,1,:now,:now)")
                    .param("id",conversationId).param("orderId",orderId).param("caseId",caseId).param("participant",participantId).param("status",writable?"ACTIVE":"READ_ONLY").param("now",now).update();}
            final UUID cid=conversationId;
            addParticipant(cid,participantId,"CASE_PARTICIPANT",writable,now);addParticipant(cid,actorId,"ADMIN_REVIEWER",writable,now);
            db.sql("INSERT INTO chat_case_conversation_requests(case_id,idempotency_key,request_hash,conversation_id,created_at) VALUES(:caseId,:key,:hash,:conversation,:now)")
                    .param("caseId",caseId).param("key",key).param("hash",requestHash).param("conversation",conversationId).param("now",now).update();
        }
        if(!access.path("canWriteConversation").asBoolean(false)){
            OffsetDateTime lockedAt=OffsetDateTime.now(clock);
            db.sql("UPDATE chat_conversations SET status='READ_ONLY',locked_at=COALESCE(locked_at,:at),updated_at=:at WHERE id=:id")
                    .param("at",lockedAt).param("id",conversationId).update();
            db.sql("UPDATE chat_participants SET can_write=false,valid_until=COALESCE(valid_until,:at) WHERE conversation_id=:id")
                    .param("at",lockedAt).param("id",conversationId).update();
        }
        String status=db.sql("SELECT status FROM chat_conversations WHERE id=:id").param("id",conversationId).query(String.class).single();
        return Map.of("conversationId",conversationId,"caseId",caseId,"orderId",orderId,"participantUserId",participantId,"readOnly","READ_ONLY".equals(status));
    }
    private void addParticipant(UUID conversation,UUID user,String relationship,boolean writable,OffsetDateTime now){db.sql("INSERT INTO chat_participants(conversation_id,user_id,assignment_epoch,relationship,can_write,valid_from) VALUES(:c,:u,1,:r,:w,:n) ON CONFLICT(conversation_id,user_id,assignment_epoch) DO UPDATE SET can_write=EXCLUDED.can_write")
            .param("c",conversation).param("u",user).param("r",relationship).param("w",writable).param("n",now).update();}
    private void requireAdmin(Jwt actor){if(!"ADMIN".equals(actor.getClaimAsString("role")))throw hidden();JsonNode e=internal.userEligibility(UUID.fromString(actor.getSubject()));if(!e.path("active").asBoolean()||!e.path("administrator").asBoolean())throw hidden();}
    private List<Record> orderEvidence(UUID orderId){return db.sql("SELECT event_id,source,stream,source_sequence,order_id,action,actor_user_id,occurred_at,ingested_at,data::text FROM chat_evidence_records WHERE order_id=:orderId AND source='order-service' ORDER BY source_sequence")
            .param("orderId",orderId).query((rs,n)->new Record(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getLong(4),rs.getObject(5,UUID.class),rs.getString(6),rs.getObject(7,UUID.class),rs.getObject(8,OffsetDateTime.class),rs.getObject(9,OffsetDateTime.class),json.readTree(rs.getString(10)))).list();}
    private List<Record> allEvidence(UUID orderId){return db.sql("SELECT event_id,source,stream,source_sequence,order_id,action,actor_user_id,occurred_at,ingested_at,data::text FROM chat_evidence_records WHERE order_id=:orderId ORDER BY occurred_at,source,source_sequence,event_id").param("orderId",orderId).query((rs,n)->new Record(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getLong(4),rs.getObject(5,UUID.class),rs.getString(6),rs.getObject(7,UUID.class),rs.getObject(8,OffsetDateTime.class),rs.getObject(9,OffsetDateTime.class),json.readTree(rs.getString(10)))).list();}
    private void reconcile(List<JsonNode> pages) {
        for (JsonNode page : pages) {
            JsonNode checkpoint = page.path("checkpoint");
            String source = checkpoint.path("source").asText();
            String stream = checkpoint.path("stream").asText();
            UUID aggregate = UUID.fromString(checkpoint.path("aggregateId").asText());
            long committed = checkpoint.path("committedSequence").asLong();
            OffsetDateTime checked = OffsetDateTime.parse(checkpoint.path("checkedAt").asText());

            for (JsonNode record : page.path("records")) {
                UUID eventId = UUID.fromString(record.path("eventId").asText());
                if (evidenceExists(eventId)) {
                    if (!sameEvidence(eventId, source, stream, aggregate, record)) {
                        throw new ChatConflictException("Conflicting evidence event " + eventId);
                    }
                    continue;
                }

                String hash = sha256(canonicalEvidence(source, stream, aggregate, record));
                db.sql("""
                        INSERT INTO chat_evidence_records(
                            event_id,source,stream,aggregate_id,source_sequence,order_id,action,
                            actor_user_id,occurred_at,ingested_at,data,payload_hash)
                        VALUES(:event,:source,:stream,:aggregate,:sequence,:orderId,:action,
                            :actor,:occurred,:ingested,CAST(:data AS jsonb),:hash)
                        """)
                        .param("event", eventId)
                        .param("source", source)
                        .param("stream", stream)
                        .param("aggregate", aggregate)
                        .param("sequence", record.path("sourceSequence").asLong())
                        .param("orderId", UUID.fromString(record.path("orderId").asText()))
                        .param("action", record.path("action").asText())
                        .param("actor", nullableUuid(record, "actorUserId"), java.sql.Types.OTHER)
                        .param("occurred", OffsetDateTime.parse(record.path("occurredAt").asText()))
                        .param("ingested", OffsetDateTime.parse(record.path("ingestedAt").asText()))
                        .param("data", record.path("data").toString())
                        .param("hash", hash)
                        .update();
            }

            db.sql("""
                    INSERT INTO chat_projection_checkpoints(
                        source,stream,aggregate_id,committed_sequence,checked_at)
                    VALUES(:source,:stream,:aggregate,:committed,:checked)
                    ON CONFLICT(source,stream,aggregate_id) DO UPDATE SET
                        committed_sequence=EXCLUDED.committed_sequence,
                        checked_at=EXCLUDED.checked_at
                    """)
                    .param("source", source)
                    .param("stream", stream)
                    .param("aggregate", aggregate)
                    .param("committed", committed)
                    .param("checked", checked)
                    .update();
        }
    }

    private boolean evidenceExists(UUID eventId) {
        return db.sql("SELECT EXISTS(SELECT 1 FROM chat_evidence_records WHERE event_id=:id)")
                .param("id", eventId)
                .query(Boolean.class)
                .single();
    }

    private boolean sameEvidence(UUID eventId, String source, String stream, UUID aggregate,
            JsonNode record) {
        return db.sql("""
                SELECT source,stream,aggregate_id,source_sequence,order_id,action,actor_user_id,
                    occurred_at,data::text
                FROM chat_evidence_records WHERE event_id=:id
                """)
                .param("id", eventId)
                .query((rs, row) -> source.equals(rs.getString(1))
                        && stream.equals(rs.getString(2))
                        && aggregate.equals(rs.getObject(3, UUID.class))
                        && record.path("sourceSequence").asLong() == rs.getLong(4)
                        && UUID.fromString(record.path("orderId").asText())
                                .equals(rs.getObject(5, UUID.class))
                        && record.path("action").asText().equals(rs.getString(6))
                        && Objects.equals(nullableUuid(record, "actorUserId"),
                                rs.getObject(7, UUID.class))
                        && OffsetDateTime.parse(record.path("occurredAt").asText()).toInstant()
                                .equals(rs.getObject(8, OffsetDateTime.class).toInstant())
                        && record.path("data").equals(json.readTree(rs.getString(9))))
                .optional()
                .orElse(false);
    }

    private String canonicalEvidence(String source, String stream, UUID aggregate, JsonNode record) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("source", source);
        value.put("stream", stream);
        value.put("aggregateId", aggregate);
        value.put("sourceSequence", record.path("sourceSequence").asLong());
        value.put("orderId", UUID.fromString(record.path("orderId").asText()));
        value.put("action", record.path("action").asText());
        value.put("actorUserId", nullableUuid(record, "actorUserId"));
        value.put("occurredAt", OffsetDateTime.parse(record.path("occurredAt").asText()).toInstant());
        value.put("data", record.path("data"));
        return json.writeValueAsString(value);
    }

    private static UUID nullableUuid(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : UUID.fromString(value);
    }
    private Map<String,Object> response(UUID orderId,UUID userId,boolean eligible,List<Record> records){return Map.of("orderId",orderId,"userId",userId,"eligible",eligible,"evidenceRevision",revision(records),"coverage",coverage(orderId,null,records));}
    private Map<String,Object> coverage(UUID orderId,UUID caseId,List<Record> records){
        List<SourceKey> required=new ArrayList<>();required.add(new SourceKey("order-service","order.lifecycle.events",orderId));if(caseId!=null){required.add(new SourceKey("credit-service","credit.events",orderId));required.add(new SourceKey("admin-service","admin.events",caseId));}List<Map<String,Object>> checkpoints=new ArrayList<>(),gaps=new ArrayList<>();Instant now=Instant.now(clock);
        for(SourceKey key:required){long projected=contiguous(records.stream().filter(r->r.source().equals(key.source)&&r.stream().equals(key.stream)&&r.orderId().equals(orderId)).sorted(Comparator.comparingLong(Record::sequence)).toList());var cp=db.sql("SELECT committed_sequence,checked_at FROM chat_projection_checkpoints WHERE source=:source AND stream=:stream AND aggregate_id=:id").param("source",key.source).param("stream",key.stream).param("id",key.aggregate).query((rs,n)->Map.of("sequence",rs.getLong(1),"checked",rs.getObject(2,OffsetDateTime.class))).optional();long committed=cp.map(v->(Long)v.get("sequence")).orElse(0L);Instant checked=cp.map(v->((OffsetDateTime)v.get("checked")).toInstant()).orElse(now);checkpoints.add(Map.of("source",key.source,"stream",key.stream,"aggregateId",key.aggregate,"committedSequence",committed,"checkedAt",checked,"projectedSequence",projected));if(cp.isEmpty()||projected<committed||committed==0)gaps.add(Map.of("source",key.source,"stream",key.stream,"aggregateId",key.aggregate,"fromSequence",projected+1,"toSequence",Math.max(projected+1,committed),"reason",cp.isEmpty()?"SOURCE_UNAVAILABLE":"MISSING_SEQUENCE"));}
        return Map.of("status",gaps.isEmpty()?"COMPLETE":"INCOMPLETE","asOf",now,"checkpoints",checkpoints,"blockingGaps",gaps);
    }
    private static long contiguous(List<Record> rows){long expected=1;for(Record row:rows){if(row.sequence()!=expected)break;expected++;}return expected-1;}
    private static List<Map<String,Object>> participants(List<Record> rows){Map<UUID,Map<String,Object>> out=new LinkedHashMap<>();for(Record r:rows){JsonNode d=r.data();String req=d.path("requesterId").asText(null);if(req!=null)out.putIfAbsent(UUID.fromString(req),new LinkedHashMap<>(Map.of("userId",UUID.fromString(req),"relationship","REQUESTER","assignedAt",r.occurredAt(),"unassignedAt",r.occurredAt())));for(String f:List.of("courierId","previousCourierId")){String v=d.path(f).asText(null);if(v!=null&&!v.isBlank())out.putIfAbsent(UUID.fromString(v),new LinkedHashMap<>(Map.of("userId",UUID.fromString(v),"relationship","HISTORICAL_COURIER","assignedAt",r.occurredAt(),"unassignedAt",r.occurredAt())));}}return new ArrayList<>(out.values());}
    private static String revision(List<Record> rows){return sha256(rows.stream().map(r->r.eventId()+":"+r.sequence()).reduce("",String::concat));}
    private static String encodeCursor(String revision,int offset){return Base64.getUrlEncoder().withoutPadding().encodeToString((revision+":"+offset).getBytes(StandardCharsets.UTF_8));}
    private static int decodeCursor(String cursor,String revision){try{String[] p=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split(":",2);if(!revision.equals(p[0]))throw new IllegalArgumentException();return Integer.parseInt(p[1]);}catch(Exception ex){throw new ResponseStatusException(HttpStatus.CONFLICT,"Evidence cursor is no longer valid");}}
    private static String sha256(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
    private static ResponseStatusException hidden(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"Resource not found");}
    private static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    private record Record(UUID eventId,String source,String stream,long sequence,UUID orderId,String action,UUID actor,OffsetDateTime occurredAt,OffsetDateTime ingestedAt,JsonNode data){Map<String,Object> wire(){Map<String,Object> m=new LinkedHashMap<>();m.put("eventId",eventId);m.put("source",source);m.put("stream",stream);m.put("sourceSequence",sequence);m.put("orderId",orderId);m.put("action",action);m.put("actorUserId",actor);m.put("occurredAt",occurredAt);m.put("ingestedAt",ingestedAt);m.put("data",JsonMapper.builder().build().convertValue(data,Map.class));return m;}}
    private record SourceKey(String source,String stream,UUID aggregate){}
}
