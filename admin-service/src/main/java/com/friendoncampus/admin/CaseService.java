package com.friendoncampus.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static com.friendoncampus.admin.CaseViews.*;

@Service
public class CaseService {
    private final JdbcTemplate db;
    private final UserEligibilityClient users;
    private final ChatEligibilityClient chat;
    private final TransactionTemplate transaction;
    private final JsonMapper json = JsonMapper.builder().build();
    private static final String CASE_COLUMNS = "id, order_id, state, reviewer_id, revision, created_at, correlation_id, source_sequence";

    public CaseService(JdbcTemplate db, UserEligibilityClient users, ChatEligibilityClient chat, PlatformTransactionManager manager) {
        this.db = db; this.users = users; this.chat = chat;
        transaction = new TransactionTemplate(manager);
        transaction.setTimeout(15);
    }

    public Mutation report(Jwt jwt, UUID key, UUID orderId, String description) {
        UUID actor = requireParticipant(jwt);
        String text = description == null ? "" : description.strip();
        if (orderId == null || text.isEmpty() || text.length() > 2000) throw invalid("An errand UUID and an issue of 1–2000 characters are required.");
        String route = "/api/admin/reports";
        String hash = hash(List.of(orderId.toString(), text));
        Mutation replay = receipt(key, actor, route, hash);
        if (replay != null) return replay;
        // All remote checks finish before opening a mutation transaction or acquiring locks.
        var eligibility = chat.check(orderId, actor, jwt.getTokenValue());
        if (!eligibility.complete()) throw unavailable("Reporting eligibility evidence is incomplete. Please try again later.");
        if (!eligibility.eligible()) return mutate(key, actor, route, hash, () -> problem(403, "You are not eligible to report this errand.", route));
        return mutate(key, actor, route, hash, () -> {
            lock("order:" + orderId);
            List<CaseRow> rows = db.query("SELECT " + CASE_COLUMNS + " FROM admin_cases WHERE order_id=? FOR UPDATE", this::caseRow, orderId);
            boolean opened = rows.isEmpty();
            Instant now = Instant.now();
            UUID caseId;
            if (opened) {
                caseId = UUID.randomUUID();
                db.update("INSERT INTO admin_cases(id,order_id,state,revision,created_at,correlation_id,source_sequence) VALUES (?,?,'OPEN',1,?,?,1)",
                        caseId, orderId, timestamp(now), UUID.randomUUID());
            } else {
                CaseRow existing = rows.get(0);
                caseId = existing.summary.caseId();
                if (existing.summary.state() == AdminCase.State.RESOLVED) return problem(409, "This case is resolved and no longer accepts reports.", route);
                if (hasStatement(caseId, actor)) return problem(409, "You have already submitted a statement for this errand.", route);
                db.update("UPDATE admin_cases SET revision=revision+1 WHERE id=?", caseId);
            }
            db.update("INSERT INTO admin_case_participants(case_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING", caseId, actor);
            db.update("INSERT INTO admin_statements(case_id,reporter_id,description,submitted_at,eligibility_revision) VALUES (?,?,?,?,?)",
                    caseId, actor, text, timestamp(now), eligibility.evidenceRevision());
            CaseRow saved = row(caseId);
            audit(saved, actor, opened ? "CASE_OPENED" : "STATEMENT_ADDED", now);
            if (opened) event(saved, actor, jwt.getClaimAsString("role"), "CaseOpened", "reporterId", actor, now);
            return result(201, new ParticipantReport(saved.summary, statement(caseId, actor)));
        });
    }

    public Mutation claim(Jwt jwt, UUID key, UUID caseId, long expectedRevision) {
        UUID actor = requireAdmin(jwt);
        if (expectedRevision < 0) throw invalid("Revision must be non-negative.");
        String route = "/api/admin/cases/" + caseId + "/claim";
        String hash = hash(List.of(expectedRevision));
        return mutate(key, actor, route, hash, () -> {
            List<CaseRow> rows = db.query("SELECT " + CASE_COLUMNS + " FROM admin_cases WHERE id=? FOR UPDATE", this::caseRow, caseId);
            if (rows.isEmpty()) return problem(404, "Case not found.", route);
            CaseRow c = rows.get(0);
            if (c.summary.revision() != expectedRevision) return problem(409, "This case has changed. Refresh it before claiming.", route);
            if (c.summary.state() != AdminCase.State.OPEN) return problem(409, "This case has already been claimed or resolved.", route);
            db.update("UPDATE admin_cases SET state='UNDER_REVIEW',reviewer_id=?,revision=revision+1,source_sequence=source_sequence+1 WHERE id=?", actor, caseId);
            CaseRow saved = row(caseId);
            Instant now = Instant.now();
            audit(saved, actor, "CASE_CLAIMED", now);
            event(saved, actor, "ADMIN", "CaseClaimed", "reviewerId", actor, now);
            return result(200, saved.summary);
        });
    }

    public ParticipantReport reportStatus(Jwt jwt, UUID caseId) {
        UUID actor = requireParticipant(jwt);
        // Only an existing statement grants participant status access; no Chat outage is needed to read it.
        if (!hasStatement(caseId, actor)) throw hidden();
        return new ParticipantReport(row(caseId).summary, statement(caseId, actor));
    }

    public Page queue(Jwt jwt, AdminCase.State state, UUID query, int page, int size) {
        requireAdmin(jwt);
        if (page < 0 || size < 1 || size > 100) throw invalid("Page must be non-negative and size must be between 1 and 100.");
        String where = " WHERE 1=1";
        List<Object> args = new ArrayList<>();
        if (state != null) { where += " AND state=?"; args.add(state.name()); }
        if (query != null) { where += " AND (id=? OR order_id=?)"; args.add(query); args.add(query); }
        Long count = db.queryForObject("SELECT count(*) FROM admin_cases" + where, Long.class, args.toArray());
        args.add(size); args.add((long)page * size);
        List<Summary> content = db.query("SELECT " + CASE_COLUMNS + " FROM admin_cases" + where + " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (r,n) -> caseRow(r,n).summary, args.toArray());
        long total = count == null ? 0 : count;
        return new Page(content, page, size, total, (int)Math.min(Integer.MAX_VALUE, (total + size - 1) / size));
    }

    public Detail detail(Jwt jwt, UUID caseId) {
        requireAdmin(jwt);
        // A repeatable local read keeps summary/revision and statements from the same snapshot.
        TransactionTemplate read = new TransactionTemplate(transaction.getTransactionManager());
        read.setReadOnly(true);
        read.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
        return read.execute(s -> new Detail(row(caseId).summary,
                db.query("SELECT reporter_id,description,submitted_at FROM admin_statements WHERE case_id=? ORDER BY submitted_at,reporter_id", this::statementRow, caseId), List.of(), null));
    }

    private UUID requireParticipant(Jwt jwt) {
        if (!Set.of("REQUESTER", "COURIER").contains(jwt.getClaimAsString("role"))) throw forbidden("Select Requester or Courier mode to access participant reports.");
        UUID actor = UUID.fromString(jwt.getSubject());
        if (!users.find(actor).active()) throw forbidden("An active verified account is required.");
        return actor;
    }
    private UUID requireAdmin(Jwt jwt) {
        if (!"ADMIN".equals(jwt.getClaimAsString("role"))) throw forbidden("Select Admin mode to review cases.");
        UUID actor = UUID.fromString(jwt.getSubject());
        var eligibility = users.find(actor);
        if (!eligibility.active() || !eligibility.administrator()) throw forbidden("An active administrator account is required.");
        return actor;
    }

    private Mutation mutate(UUID key, UUID actor, String route, String hash, Supplier<Mutation> operation) {
        if (key == null) throw invalid("An Idempotency-Key UUID is required.");
        try {
            return transaction.execute(status -> {
                db.execute("SET LOCAL lock_timeout='5s'");
                lock("request:" + key);
                Mutation previous = receipt(key, actor, route, hash);
                if (previous != null) return previous;
                Mutation outcome = operation.get();
                db.update("INSERT INTO admin_mutation_receipts(idempotency_key,actor_id,route,request_hash,response_status,response_body) VALUES (?,?,?,?,?,?)",
                        key, actor, route, hash, outcome.status(), outcome.body());
                return outcome;
            });
        } catch (DataAccessException | org.springframework.transaction.TransactionException ex) { throw unavailable("The case could not be saved. Retry using the same request key."); }
    }
    private Mutation receipt(UUID key, UUID actor, String route, String hash) {
        if (key == null) throw invalid("An Idempotency-Key UUID is required.");
        return db.query("SELECT actor_id,route,request_hash,response_status,response_body FROM admin_mutation_receipts WHERE idempotency_key=?", r -> {
            if (!r.next()) return null;
            if (!actor.equals(r.getObject("actor_id", UUID.class)) || !route.equals(r.getString("route")) || !hash.equals(r.getString("request_hash")))
                return problem(409, "This request key was already used for a different request.", route);
            return new Mutation(r.getInt("response_status"), r.getString("response_body"));
        }, key);
    }
    private void lock(String identity) {
        // Database-scoped transaction locks serialize missing-row creation and receipt races across replicas.
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", r -> null, identity);
    }
    private boolean hasStatement(UUID c, UUID actor) {
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_statements WHERE case_id=? AND reporter_id=?)", Boolean.class, c, actor));
    }
    private CaseRow row(UUID id) {
        var rows = db.query("SELECT " + CASE_COLUMNS + " FROM admin_cases WHERE id=?", this::caseRow, id);
        if (rows.isEmpty()) throw hidden();
        return rows.get(0);
    }
    private CaseRow caseRow(ResultSet r, int n) throws SQLException {
        return new CaseRow(new Summary(r.getObject("id", UUID.class), r.getObject("order_id", UUID.class), AdminCase.State.valueOf(r.getString("state")),
                r.getObject("reviewer_id", UUID.class), r.getLong("revision"), r.getObject("created_at", OffsetDateTime.class).toInstant()),
                r.getObject("correlation_id", UUID.class), r.getLong("source_sequence"));
    }
    private Statement statement(UUID c, UUID actor) {
        var rows = db.query("SELECT reporter_id,description,submitted_at FROM admin_statements WHERE case_id=? AND reporter_id=?", this::statementRow, c, actor);
        if (rows.isEmpty()) throw hidden();
        return rows.get(0);
    }
    private Statement statementRow(ResultSet r, int n) throws SQLException {
        return new Statement(r.getObject("reporter_id", UUID.class), r.getString("description"), r.getObject("submitted_at", OffsetDateTime.class).toInstant());
    }
    private void audit(CaseRow c, UUID actor, String action, Instant time) {
        db.update("INSERT INTO admin_case_audit(id,case_id,case_revision,actor_id,action,occurred_at) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), c.summary.caseId(), c.summary.revision(), actor, action, timestamp(time));
    }
    private void event(CaseRow c, UUID actor, String role, String type, String participantField, UUID participant, Instant time) {
        UUID eventId = UUID.randomUUID();
        Map<String,Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId); envelope.put("eventType", type); envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "AdminCase"); envelope.put("aggregateId", c.summary.caseId()); envelope.put("aggregateVersion", c.summary.revision());
        envelope.put("occurredAt", time); envelope.put("producer", "admin-service"); envelope.put("correlationId", c.correlationId); envelope.put("causationId", null);
        envelope.put("actor", Map.of("type", "USER", "userId", actor, "role", role));
        envelope.put("data", Map.of("caseId", c.summary.caseId(), "orderId", c.summary.orderId(), "sourceSequence", c.sourceSequence, participantField, participant));
        db.update("INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES (?,?,?,?,?,?,?)",
                eventId, c.summary.caseId(), c.sourceSequence, type, "admin.events", json.writeValueAsString(envelope), timestamp(time));
    }
    private String hash(Object input) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(input).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception ex) { throw new IllegalStateException("Unable to fingerprint request", ex); }
    }
    private Mutation result(int status, Object body) { return new Mutation(status, json.writeValueAsString(body)); }
    private Mutation problem(int status, String detail, String route) {
        return result(status, Map.of("type", "about:blank", "title", HttpStatus.valueOf(status).getReasonPhrase(), "status", status, "detail", detail, "instance", route));
    }
    private static OffsetDateTime timestamp(Instant time) { return time.atOffset(ZoneOffset.UTC); }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException forbidden(String message) { return new ResponseStatusException(HttpStatus.FORBIDDEN, message); }
    private static ResponseStatusException unavailable(String message) { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message); }
    private static ResponseStatusException hidden() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."); }
    private record CaseRow(Summary summary, UUID correlationId, long sourceSequence) { }
}
