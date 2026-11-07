package com.friendoncampus.chat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.mock.web.MockMultipartFile;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.repository.ChatPreferenceRepository;
import com.friendoncampus.chat.messaging.OrderLifecycleConsumer;

@SpringBootTest(properties = {"app.kafka.enabled=false", "app.rabbit.enabled=false"})
@Testcontainers(disabledWithoutDocker = true)
class ChatPreferencePersistenceIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    ChatPreferenceService preferences;

    @Autowired
    ChatPreferenceRepository repository;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired JdbcClient jdbcClient;
    @Autowired Clock clock;
    @Autowired ChatConversationService chats;

    @BeforeEach
    void clearPreferences() {
        jdbc.execute("TRUNCATE chat_messages,chat_attachments,chat_participants,chat_conversations,chat_processed_events,chat_preferences CASCADE");
    }

    @Test
    void defaultsWithoutCreatingARecordAndKeepsUsersIsolated() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();

        assertThat(preferences.get(first)).isEqualTo(ChatLanguage.EN);
        assertThat(repository.count()).isZero();

        assertThat(preferences.put(first, "ta")).isEqualTo(ChatLanguage.TA);
        assertThat(preferences.get(first)).isEqualTo(ChatLanguage.TA);
        assertThat(preferences.get(second)).isEqualTo(ChatLanguage.EN);
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void databaseRejectsUnsupportedLanguageValues() {
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO chat_preferences (user_id, preferred_language, created_at, updated_at)
                VALUES (?, 'XX', now(), now())
                """, UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void lifecycleCreatesPrivateChatSegmentsCourierHistoryAndLocksTerminalConversation() {
        UUID order=UUID.randomUUID(), requester=UUID.randomUUID(), first=UUID.randomUUID(), second=UUID.randomUUID();
        OrderLifecycleConsumer consumer=new OrderLifecycleConsumer(jdbcClient,clock);
        String accepted=event(order,requester,first,"ACCEPT","ACCEPTED",1);
        consumer.process(accepted);
        consumer.process(accepted); // exact Kafka retry is harmless
        assertThatThrownBy(() -> consumer.process(event(order,requester,first,"ACCEPT","ACCEPTED",1)))
                .isInstanceOf(IllegalStateException.class);
        var conversation=chats.byOrder(order,requester);
        var firstMessage=chats.sendText(conversation.id(),first,UUID.randomUUID(),"TEXT","Meet at the library",null);
        assertThat(chats.messageRecipients(firstMessage.id())).containsExactlyInAnyOrder(requester,first);
        consumer.process(event(order,requester,null,"WITHDRAW","OPEN",2,first));
        consumer.process(event(order,requester,second,"ACCEPT","ACCEPTED",3));
        var secondMessage=chats.sendText(conversation.id(),second,UUID.randomUUID(),"TEXT","On my way",null);
        assertThat(chats.messageRecipients(secondMessage.id())).containsExactlyInAnyOrder(requester,second);

        assertThat(chats.messages(conversation.id(),requester,0,100)).hasSize(2);
        assertThat(chats.messages(conversation.id(),second,0,100)).extracting(ChatConversationService.Message::id).containsExactly(secondMessage.id());
        assertThat(chats.byOrder(order,first).readOnly()).isTrue();
        assertThatThrownBy(() -> chats.sendText(conversation.id(),first,UUID.randomUUID(),"TEXT","still here",null))
                .isInstanceOf(ChatConflictException.class);

        byte[] png={(byte)0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a};
        var attachment=chats.upload(conversation.id(),second,new MockMultipartFile("file","proof.png","image/png",png));
        chats.sendImage(conversation.id(),second,UUID.randomUUID(),attachment.id());
        assertThat(chats.attachment(conversation.id(),attachment.id(),requester).content()).isEqualTo(png);
        assertThatThrownBy(() -> chats.attachment(conversation.id(),attachment.id(),first)).isInstanceOf(ChatAccessException.class);
        assertThatThrownBy(() -> chats.upload(conversation.id(),second,new MockMultipartFile("file","fake.png","image/png","not an image".getBytes())))
                .isInstanceOf(IllegalArgumentException.class);

        consumer.process(event(order,requester,second,"COMPLETE","COMPLETED",4));
        assertThat(chats.byOrder(order,requester).readOnly()).isTrue();
        assertThatThrownBy(() -> chats.sendText(conversation.id(),requester,UUID.randomUUID(),"TEXT","thanks",null))
                .isInstanceOf(ChatConflictException.class);
    }

    private static String event(UUID order,UUID requester,UUID courier,String action,String to,long version){return event(order,requester,courier,action,to,version,courier);}
    private static String event(UUID order,UUID requester,UUID courier,String action,String to,long version,UUID previous){
        return "{\"eventId\":\""+UUID.randomUUID()+"\",\"eventType\":\"OrderTransitioned\",\"occurredAt\":\""+OffsetDateTime.now()+"\",\"data\":{\"orderId\":\""+order+"\",\"requesterId\":\""+requester+"\",\"courierId\":"+(courier==null?"null":"\""+courier+"\"")+",\"previousCourierId\":"+(previous==null?"null":"\""+previous+"\"")+",\"action\":\""+action+"\",\"toState\":\""+to+"\",\"sourceSequence\":"+version+"}}";
    }
}
