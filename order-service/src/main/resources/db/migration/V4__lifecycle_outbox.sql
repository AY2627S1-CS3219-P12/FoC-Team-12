CREATE TABLE lifecycle_outbox_events (
    id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL,
    source_sequence BIGINT NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_lifecycle_outbox_pending ON lifecycle_outbox_events(created_at,id) WHERE published_at IS NULL;
CREATE UNIQUE INDEX uq_lifecycle_outbox_order_sequence ON lifecycle_outbox_events(aggregate_id,source_sequence);
