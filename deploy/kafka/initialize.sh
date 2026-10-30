#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=lib.sh
source /opt/foc-kafka/lib.sh
require_env KAFKA_ADMIN_PASSWORD

bootstrap_servers=${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}
admin_properties=/tmp/foc-kafka-admin.properties
write_client_properties "$admin_properties" foc_admin "$KAFKA_ADMIN_PASSWORD"

create_topic() {
  local topic=$1
  local partitions=$2
  local retention_ms=$3

  kafka_command kafka-topics.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --create --if-not-exists \
    --topic "$topic" \
    --partitions "$partitions" \
    --replication-factor 1 \
    --config cleanup.policy=delete \
    --config "retention.ms=$retention_ms"

  kafka_command kafka-configs.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --alter --entity-type topics --entity-name "$topic" \
    --add-config "cleanup.policy=delete,retention.ms=$retention_ms"
}

add_acl() {
  local principal=$1
  shift
  # Batch only equivalent resource/operation sets. Do not use --producer: it also grants Create.
  kafka_command kafka-acls.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --add --allow-principal "User:$principal" \
    "$@"
}

add_idempotent_write_acl() {
  local principal=$1
  add_acl "$principal" --operation IdempotentWrite --cluster
}

# Independent resources can be initialized concurrently. Wait for every child and fail
# the initializer if any operation failed; dependent services must never see partial success.
wait_all() {
  local failed=0
  local pid
  for pid in "$@"; do
    wait "$pid" || failed=1
  done
  return "$failed"
}

pids=()
for topic in user.events order.events credit.events admin.credit.commands credit.admin.events; do
  create_topic "$topic" 3 604800000 &
  pids+=("$!")
done
wait_all "${pids[@]}"

pids=()
for topic in user.events.DLT order.events.DLT credit.events.DLT admin.credit.commands.DLT credit.admin.events.DLT; do
  create_topic "$topic" 1 2592000000 &
  pids+=("$!")
done
wait_all "${pids[@]}"

# User Service publishes activation facts.
{
add_acl user_service --operation Write --operation Describe --topic user.events
add_idempotent_write_acl user_service
} &
pids=("$!")

# Order Service publishes lifecycle facts and consumes Credit outcomes.
{
add_acl order_service --operation Write --operation Describe --topic order.events --topic credit.events.DLT
add_acl order_service --operation Read --operation Describe --topic credit.events
add_acl order_service --operation Read --group order-service
add_idempotent_write_acl order_service
} &
pids+=("$!")

# Credit Service consumes User/Order facts and publishes outcomes.
{
add_acl credit_service --operation Read --operation Describe --topic user.events --topic order.events
add_acl credit_service --operation Read --group credit-service
add_acl credit_service --operation Write --operation Describe \
  --topic credit.events --topic user.events.DLT --topic order.events.DLT
add_idempotent_write_acl credit_service
} &
pids+=("$!")

# Administrative corrections: permissions prepare the handoff; Credit's consumer is still pending.
{
add_acl admin_service --operation Write --operation Describe --topic admin.credit.commands --topic credit.admin.events.DLT
add_acl admin_service --operation Read --operation Describe --topic credit.admin.events
add_acl admin_service --operation Read --group admin-service-credit
add_idempotent_write_acl admin_service
add_acl credit_service --operation Read --operation Describe --topic admin.credit.commands
add_acl credit_service --operation Read --group credit-service-admin
add_acl credit_service --operation Write --operation Describe --topic credit.admin.events --topic admin.credit.commands.DLT
} &
pids+=("$!")

# Kafka UI can inspect this local cluster but cannot mutate topics, data or business offsets.
{
add_acl kafka_ui --operation Read --operation Describe --operation DescribeConfigs \
  --topic user.events --topic order.events --topic credit.events \
  --topic user.events.DLT --topic order.events.DLT --topic credit.events.DLT \
  --topic admin.credit.commands --topic credit.admin.events \
  --topic admin.credit.commands.DLT --topic credit.admin.events.DLT
add_acl kafka_ui --operation Describe --operation DescribeConfigs --cluster
add_acl kafka_ui --operation Describe --group order-service --group credit-service --group admin-service-credit --group credit-service-admin
add_acl kafka_ui --operation Read --operation Describe --group kafka-ui-browser --resource-pattern-type prefixed
} &
pids+=("$!")
wait_all "${pids[@]}"

echo "Kafka topics and ACLs are initialized. Re-running this initializer is safe."
