package com.friendoncampus.chat.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(name="app.kafka.enabled",havingValue="true",matchIfMissing=true)
public class OrderLifecycleConsumer {
    private static final Set<String> TERMINAL=Set.of("COMPLETED","CANCELLED","EXPIRED","RESERVATION_FAILED");
    private final JdbcClient db; private final Clock clock; private final JsonMapper json=JsonMapper.builder().build();
    public OrderLifecycleConsumer(JdbcClient db,Clock clock){this.db=db;this.clock=clock;}

    @KafkaListener(topics="order.lifecycle.events",groupId="chat-service-lifecycle")
    public void receive(String payload,Acknowledgment ack){process(payload);ack.acknowledge();}

    @Transactional
    public void process(String payload){
        JsonNode root=json.readTree(payload);UUID eventId=uuid(root,"eventId");String hash=hash(payload);
        String prior=db.sql("SELECT payload_hash FROM chat_processed_events WHERE event_id=:id").param("id",eventId).query(String.class).optional().orElse(null);
        if(prior!=null){if(!prior.equals(hash))throw new IllegalStateException("Conflicting lifecycle event "+eventId);return;}
        if(!"OrderTransitioned".equals(root.path("eventType").asText()))throw new IllegalArgumentException("Unsupported lifecycle event");
        JsonNode d=root.path("data");UUID orderId=uuid(d,"orderId");long sourceSequence=d.path("sourceSequence").asLong(-1);
        if(sourceSequence<1)throw new IllegalArgumentException("sourceSequence must be positive");
        String sequenceHash=db.sql("SELECT payload_hash FROM chat_processed_events WHERE order_id=:orderId AND source_sequence=:sequence")
                .param("orderId",orderId).param("sequence",sourceSequence).query(String.class).optional().orElse(null);
        if(sequenceHash!=null)throw new IllegalStateException("Conflicting lifecycle sequence "+orderId+"/"+sourceSequence);
        UUID requester=uuid(d,"requesterId");
        String action=d.path("action").asText();String to=d.path("toState").asText();OffsetDateTime at=OffsetDateTime.parse(root.path("occurredAt").asText());
        if("ACCEPT".equals(action)) accept(orderId,requester,uuid(d,"courierId"),at);
        else if("WITHDRAW".equals(action)) withdraw(orderId,nullableUuid(d,"previousCourierId"),at);
        if(TERMINAL.contains(to)) lock(orderId,at);
        db.sql("INSERT INTO chat_processed_events(event_id,order_id,source_sequence,payload_hash,processed_at) VALUES(:id,:orderId,:sequence,:hash,:at)")
                .param("id",eventId).param("orderId",orderId).param("sequence",sourceSequence)
                .param("hash",hash).param("at",OffsetDateTime.now(clock)).update();
    }
    private void accept(UUID orderId,UUID requester,UUID courier,OffsetDateTime at){
        UUID cid=db.sql("SELECT id FROM chat_conversations WHERE order_id=:oid AND conversation_type='ERRAND'").param("oid",orderId).query(UUID.class).optional().orElse(null);
        if(cid==null){cid=UUID.randomUUID();db.sql("INSERT INTO chat_conversations(id,conversation_type,order_id,status,next_sequence,created_at,updated_at) VALUES(:id,'ERRAND',:oid,'ACTIVE',1,:at,:at)").param("id",cid).param("oid",orderId).param("at",at).update();}
        db.sql("INSERT INTO chat_participants(conversation_id,user_id,assignment_epoch,relationship,can_write,valid_from) VALUES(:cid,:uid,1,'REQUESTER',true,:at) ON CONFLICT(conversation_id,user_id,assignment_epoch) DO UPDATE SET can_write=true,valid_until=NULL").param("cid",cid).param("uid",requester).param("at",at).update();
        Integer epoch=db.sql("SELECT COALESCE(MAX(assignment_epoch),0)+1 FROM chat_participants WHERE conversation_id=:cid AND relationship='COURIER'").param("cid",cid).query(Integer.class).single();
        db.sql("UPDATE chat_participants SET can_write=false,valid_until=:at WHERE conversation_id=:cid AND relationship='COURIER' AND valid_until IS NULL").param("at",at).param("cid",cid).update();
        db.sql("INSERT INTO chat_participants(conversation_id,user_id,assignment_epoch,relationship,can_write,valid_from) VALUES(:cid,:uid,:epoch,'COURIER',true,:at) ON CONFLICT(conversation_id,user_id,assignment_epoch) DO NOTHING").param("cid",cid).param("uid",courier).param("epoch",epoch).param("at",at).update();
    }
    private void withdraw(UUID orderId,UUID courier,OffsetDateTime at){if(courier==null)return;db.sql("UPDATE chat_participants SET can_write=false,valid_until=:at WHERE user_id=:uid AND valid_until IS NULL AND conversation_id IN(SELECT id FROM chat_conversations WHERE order_id=:oid)").param("at",at).param("uid",courier).param("oid",orderId).update();}
    private void lock(UUID orderId,OffsetDateTime at){db.sql("UPDATE chat_conversations SET status='READ_ONLY',locked_at=:at,updated_at=:at WHERE order_id=:oid").param("at",at).param("oid",orderId).update();db.sql("UPDATE chat_participants SET can_write=false,valid_until=COALESCE(valid_until,:at) WHERE conversation_id IN(SELECT id FROM chat_conversations WHERE order_id=:oid)").param("at",at).param("oid",orderId).update();}
    private static UUID uuid(JsonNode n,String field){return UUID.fromString(n.path(field).asText());}
    private static UUID nullableUuid(JsonNode n,String field){String v=n.path(field).asText(null);return v==null||v.isBlank()?null:UUID.fromString(v);}
    private static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
