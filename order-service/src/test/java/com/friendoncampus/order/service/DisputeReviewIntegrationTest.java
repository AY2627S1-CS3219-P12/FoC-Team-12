package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.friendoncampus.order.domain.*;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties={"app.orders.expiry.enabled=false","app.kafka.enabled=false","app.kafka.lifecycle-events.enabled=true"})
@Testcontainers
class DisputeReviewIntegrationTest {
 @Container @ServiceConnection static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer("postgres:17-alpine");
 @MockitoBean JwtDecoder jwt;
 @MockitoBean DisputeCreditClient credit;
 @Autowired OrderService orders;
 @Autowired DisputeReviewService reviews;
 @Autowired JdbcTemplate db;
 @Autowired OrderQueryService queries;
 final UUID requester=UUID.randomUUID(),courier=UUID.randomUUID();
 UUID accepted(){
  UUID id=orders.createOrder(new CreateOrderCommand(requester,"TEST ONLY","Original issue",UUID.randomUUID(),"A",UUID.randomUUID(),"B",2,OffsetDateTime.now(ZoneOffset.UTC).plusDays(1))).getId();
  orders.confirmReservation(id,UUID.randomUUID());orders.accept(id,courier);return id;
 }
 @Test void freezeBlocksLifecycleAndResolutionFinishesHalfwayWithoutOrdinaryPayout(){
  UUID id=accepted(),caseId=UUID.randomUUID(),operation=UUID.randomUUID();
  assertThat(reviews.freeze(id,caseId,courier,false).participants()).contains(requester,courier);
  assertThat(reviews.freeze(id,caseId,requester,false).state()).isEqualTo("ACCEPTED");
  assertThatThrownBy(()->orders.pickUp(id,courier)).isInstanceOf(ResponseStatusException.class);
  assertThatThrownBy(()->orders.cancel(id,requester)).isInstanceOf(ResponseStatusException.class);
  when(credit.settle(any(),eq(operation),eq("RETURN_TO_REQUESTER"),anyString())).thenReturn(JsonMapper.builder().build().readTree("{\"reservationStatus\":\"RELEASED\"}"));
  assertThat(reviews.finish(id,caseId,operation,"RETURN_TO_REQUESTER","TEST ONLY").resolved()).isTrue();
  assertThat(reviews.finish(id,caseId,operation,"RETURN_TO_REQUESTER","TEST ONLY").state()).isEqualTo("COMPLETED");
  verify(credit,times(1)).settle(any(),eq(operation),anyString(),anyString());
  assertThat(db.queryForObject("SELECT terminal_reason FROM orders WHERE id=?",String.class,id)).isEqualTo("DISPUTE_RESOLVED");
  assertThat(db.queryForObject("SELECT count(*) FROM order_transitions WHERE order_id=? AND action='DISPUTE_RESOLVED'",Integer.class,id)).isEqualTo(1);
  assertThat(db.queryForObject("SELECT count(*) FROM outbox_events WHERE aggregate_id=? AND event_type='OrderCompleted'",Integer.class,id)).isZero();
  assertThatThrownBy(()->orders.complete(id,requester)).isInstanceOf(ResponseStatusException.class);
 }
 @Test void failedCreditAcknowledgementLeavesErrandFrozenAndOriginalOperationResumable(){
  UUID id=accepted(),caseId=UUID.randomUUID(),operation=UUID.randomUUID();reviews.freeze(id,caseId,requester,false);
  when(credit.settle(any(),any(),anyString(),anyString())).thenThrow(new IllegalStateException("TEST ONLY lost acknowledgement"));
  assertThatThrownBy(()->reviews.finish(id,caseId,operation,"PAY_COURIER","TEST ONLY")).isInstanceOf(IllegalStateException.class);
  assertThat(reviews.read(id,caseId).resolved()).isFalse();
  assertThat(reviews.read(id,caseId).state()).isEqualTo("ACCEPTED");
  assertThatThrownBy(()->reviews.finish(id,caseId,UUID.randomUUID(),"RETURN_TO_REQUESTER","TEST ONLY")).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void anUnassignedErrandCanFinishAfterReviewWithoutInventingACourier(){
  UUID id=orders.createOrder(new CreateOrderCommand(requester,"TEST ONLY","Before acceptance",UUID.randomUUID(),"A",UUID.randomUUID(),"B",2,OffsetDateTime.now(ZoneOffset.UTC).plusDays(1))).getId();
  orders.confirmReservation(id,UUID.randomUUID());UUID caseId=UUID.randomUUID(),operation=UUID.randomUUID();reviews.freeze(id,caseId,requester,false);
  when(credit.settle(any(),eq(operation),eq("RETURN_TO_REQUESTER"),anyString())).thenReturn(JsonMapper.builder().build().readTree("{\"reservationStatus\":\"RELEASED\"}"));
  assertThat(reviews.finish(id,caseId,operation,"RETURN_TO_REQUESTER","TEST ONLY").state()).isEqualTo("COMPLETED");
  assertThat(orders.getOrder(id,requester).getCourierId()).isNull();
 }
 @Test void frozenOverdueErrandsCannotStarveTheExpiryBatch(){
  UUID id=accepted();orders.withdraw(id,courier);reviews.freeze(id,UUID.randomUUID(),requester,false);
  db.update("UPDATE orders SET pickup_deadline=CURRENT_TIMESTAMP-interval '1 day',created_at=CURRENT_TIMESTAMP-interval '2 days' WHERE id=?",id);
  assertThat(orders.findOverdueOpenOrderIds(1)).doesNotContain(id);
  assertThat(orders.expireIfStillOverdue(id)).isFalse();
 }
 @Test void historicalCourierCanReadAndFindAResolvedReviewInPastEvenIfAlreadyCancelled(){
  UUID id=accepted();orders.withdraw(id,courier);orders.cancel(id,requester);
  db.update("UPDATE orders SET credit_status='RELEASED' WHERE id=?",id);
  UUID caseId=UUID.randomUUID(),operation=UUID.randomUUID();reviews.freeze(id,caseId,requester,false);
  assertThat(queries.findDelivered(courier,MyOrdersFilter.from("review",null),new OrderPaging(0,20)).getContent()).extracting(Order::getId).contains(id);
  assertThat(orders.getOrder(id,courier).getReviewCaseId()).isEqualTo(caseId);
  when(credit.settle(any(),eq(operation),eq("KEEP_EXISTING"),anyString())).thenReturn(JsonMapper.builder().build().readTree("{\"reservationStatus\":\"RELEASED\"}"));
  assertThat(reviews.finish(id,caseId,operation,"KEEP_EXISTING","TEST ONLY").state()).isEqualTo("CANCELLED");
  assertThat(queries.findDelivered(courier,MyOrdersFilter.PAST,new OrderPaging(0,20)).getContent()).extracting(Order::getId).contains(id);
 }
 @Test void freezingAndPickupSerializeSoNoPickupCanCommitAfterTheFreezeAcknowledgement() throws Exception {
  UUID id=accepted(),caseId=UUID.randomUUID();var start=new java.util.concurrent.CountDownLatch(1);
  var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
  try {
   var freeze=pool.submit(()->{start.await();return reviews.freeze(id,caseId,requester,false);});
   var pickup=pool.submit(()->{start.await();try{orders.pickUp(id,courier);return true;}catch(ResponseStatusException ex){return false;}});
   start.countDown();freeze.get(15,java.util.concurrent.TimeUnit.SECONDS);boolean picked=pickup.get(15,java.util.concurrent.TimeUnit.SECONDS);
   assertThat(reviews.read(id,caseId).state()).isEqualTo(picked?"PICKED_UP":"ACCEPTED");
   assertThatThrownBy(()->orders.deliver(id,courier)).isInstanceOf(ResponseStatusException.class);
  } finally {pool.shutdownNow();}
 }
 @Test void unrelatedPartyAndUnconfirmedPriorCreditsCannotFreeze(){
  UUID id=accepted();assertThatThrownBy(()->reviews.freeze(id,UUID.randomUUID(),UUID.randomUUID(),false)).isInstanceOf(ResponseStatusException.class);
  orders.pickUp(id,courier);orders.deliver(id,courier);orders.complete(id,requester);
  assertThatThrownBy(()->reviews.freeze(id,UUID.randomUUID(),requester,false)).isInstanceOf(ResponseStatusException.class);
 }
}
