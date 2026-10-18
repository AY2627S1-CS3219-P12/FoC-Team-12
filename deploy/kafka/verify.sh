#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=lib.sh
source /opt/foc-kafka/lib.sh

for variable in \
  KAFKA_ADMIN_PASSWORD \
  KAFKA_USER_SERVICE_PASSWORD \
  KAFKA_ORDER_SERVICE_PASSWORD \
  KAFKA_CREDIT_SERVICE_PASSWORD \
  KAFKA_UI_BROKER_PASSWORD; do
  require_env "$variable"
done

mode=${1:-before-restart}
consumer_timeout=${KAFKA_VERIFY_CONSUMER_TIMEOUT_SECONDS:-15}
denial_timeout=${KAFKA_VERIFY_DENIAL_TIMEOUT_SECONDS:-10}
for value in "$consumer_timeout" "$denial_timeout"; do
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || { echo 'Verification timeouts must be positive seconds' >&2; exit 1; }
done
bootstrap_servers=localhost:9092
work_dir=/tmp/foc-kafka-verification
mkdir -p "$work_dir"

write_client_properties "$work_dir/admin.properties" foc_admin "$KAFKA_ADMIN_PASSWORD"
write_client_properties "$work_dir/user.properties" user_service "$KAFKA_USER_SERVICE_PASSWORD"
write_client_properties "$work_dir/order.properties" order_service "$KAFKA_ORDER_SERVICE_PASSWORD"
write_client_properties "$work_dir/credit.properties" credit_service "$KAFKA_CREDIT_SERVICE_PASSWORD"
write_client_properties "$work_dir/ui.properties" kafka_ui "$KAFKA_UI_BROKER_PASSWORD"

admin=(--bootstrap-server "$bootstrap_servers" --command-config "$work_dir/admin.properties")

# Initialization is finished before verification. Reuse one ACL snapshot per resource instead
# of launching a fresh JVM for every operation on the same resource (especially on Minikube).
declare -A topic_acl_cache group_acl_cache prefixed_group_acl_cache
cluster_acl_cache=

assert_contains() {
  local text=$1
  local expected=$2
  local description=$3
  if [[ "$text" != *"$expected"* ]]; then
    echo "Verification failed: $description (missing '$expected')" >&2
    return 1
  fi
}

topic_end_offset() {
  local topic=$1
  kafka_command kafka-get-offsets.sh "${admin[@]}" --topic "$topic" --time latest |
    awk -F: '{ total += $3 } END { print total + 0 }'
}

verify_topic() {
  local topic=$1
  local partitions=$2
  local retention_ms=$3
  local description
  local configuration

  description=$(kafka_command kafka-topics.sh "${admin[@]}" --describe --topic "$topic")
  assert_contains "$description" "PartitionCount: $partitions" "$topic partition count"
  assert_contains "$description" "ReplicationFactor: 1" "$topic replication factor"

  configuration=$(kafka_command kafka-configs.sh "${admin[@]}" \
    --describe --entity-type topics --entity-name "$topic")
  assert_contains "$configuration" "retention.ms=$retention_ms" "$topic retention"
  assert_contains "$configuration" "cleanup.policy=delete" "$topic cleanup policy"
}

verify_acl_line() {
  local listing=$1
  local principal=$2
  local operation=$3
  local description=$4
  if ! grep -Eq "principal=User:$principal, host=\\*, operation=$operation, permissionType=ALLOW" <<< "$listing"; then
    echo "Verification failed: missing $description ACL for User:$principal ($operation)" >&2
    return 1
  fi
}

verify_topic_acl() {
  local principal=$1
  local operation=$2
  local topic=$3
  local listing
  if [[ ! ${topic_acl_cache[$topic]+present} ]]; then
    topic_acl_cache[$topic]=$(kafka_command kafka-acls.sh "${admin[@]}" --list --topic "$topic")
  fi
  listing=${topic_acl_cache[$topic]}
  verify_acl_line "$listing" "$principal" "$operation" "topic $topic"
}

verify_group_acl() {
  local principal=$1
  local operation=$2
  local group=$3
  local listing
  if [[ ! ${group_acl_cache[$group]+present} ]]; then
    group_acl_cache[$group]=$(kafka_command kafka-acls.sh "${admin[@]}" --list --group "$group")
  fi
  listing=${group_acl_cache[$group]}
  verify_acl_line "$listing" "$principal" "$operation" "group $group"
}

verify_prefixed_group_acl() {
  local principal=$1
  local operation=$2
  local group_prefix=$3
  local listing
  if [[ ! ${prefixed_group_acl_cache[$group_prefix]+present} ]]; then
    prefixed_group_acl_cache[$group_prefix]=$(kafka_command kafka-acls.sh "${admin[@]}" --list \
      --group "$group_prefix" --resource-pattern-type prefixed)
  fi
  listing=${prefixed_group_acl_cache[$group_prefix]}
  verify_acl_line "$listing" "$principal" "$operation" "group prefix $group_prefix"
}

verify_cluster_acl() {
  local principal=$1
  local operation=$2
  local listing
  if [ -z "$cluster_acl_cache" ]; then
    cluster_acl_cache=$(kafka_command kafka-acls.sh "${admin[@]}" --list --cluster)
  fi
  listing=$cluster_acl_cache
  verify_acl_line "$listing" "$principal" "$operation" "cluster"
}

verify_persisted_record() {
  local event_id
  event_id=$(cat "$work_dir/event-id")
  local output
  set +e
  output=$(timeout "$consumer_timeout" "$KAFKA_BIN_DIR/kafka-console-consumer.sh" \
    --bootstrap-server "$bootstrap_servers" \
    --consumer.config "$work_dir/admin.properties" \
    --topic user.events --from-beginning \
    --group "foc-smoke-persistence-$event_id" \
    --property print.key=true --property key.separator='|' 2>&1)
  set -e
  assert_contains "$output" "$event_id" "test record after broker restart"
  echo "Kafka record and configuration survived the broker restart."
}

for topic in user.events order.events credit.events; do
  verify_topic "$topic" 3 604800000
done
for topic in user.events.DLT order.events.DLT credit.events.DLT; do
  verify_topic "$topic" 1 2592000000
done

verify_topic_acl user_service WRITE user.events
verify_cluster_acl user_service IDEMPOTENT_WRITE
verify_topic_acl order_service READ credit.events
verify_group_acl order_service READ order-service
verify_topic_acl order_service WRITE credit.events.DLT
verify_topic_acl credit_service READ user.events
verify_topic_acl credit_service READ order.events
verify_group_acl credit_service READ credit-service
verify_topic_acl credit_service WRITE credit.events
verify_topic_acl credit_service WRITE user.events.DLT
verify_topic_acl credit_service WRITE order.events.DLT
verify_cluster_acl order_service IDEMPOTENT_WRITE
verify_cluster_acl credit_service IDEMPOTENT_WRITE

for topic in user.events order.events credit.events user.events.DLT order.events.DLT credit.events.DLT; do
  verify_topic_acl kafka_ui READ "$topic"
  verify_topic_acl kafka_ui DESCRIBE "$topic"
  verify_topic_acl kafka_ui DESCRIBE_CONFIGS "$topic"
done
verify_cluster_acl kafka_ui DESCRIBE
verify_cluster_acl kafka_ui DESCRIBE_CONFIGS
verify_group_acl kafka_ui DESCRIBE order-service
verify_group_acl kafka_ui DESCRIBE credit-service
verify_prefixed_group_acl kafka_ui READ kafka-ui-browser
verify_prefixed_group_acl kafka_ui DESCRIBE kafka-ui-browser

if [ "$mode" = after-restart ]; then
  verify_persisted_record
  exit 0
fi

event_id=$(cat /proc/sys/kernel/random/uuid)
aggregate_id=$(cat /proc/sys/kernel/random/uuid)
cat > "$work_dir/event-id" <<< "$event_id"
event="{\"eventId\":\"$event_id\",\"eventType\":\"UserActivated\",\"eventVersion\":1,\"aggregateType\":\"User\",\"aggregateId\":\"$aggregate_id\",\"aggregateVersion\":1,\"occurredAt\":\"2026-10-17T00:00:00Z\",\"producer\":\"user-service\",\"correlationId\":\"$event_id\",\"causationId\":null,\"actor\":{\"type\":\"SYSTEM\"},\"data\":{\"operationId\":\"$event_id\",\"userId\":\"$aggregate_id\",\"activatedAt\":\"2026-10-17T00:00:00Z\"}}"

consumer_output="$work_dir/authorized-consumer.out"
kafka_command kafka-console-consumer.sh \
  --bootstrap-server "$bootstrap_servers" \
  --consumer.config "$work_dir/credit.properties" \
  --consumer-property auto.offset.reset=latest \
  --topic user.events --group credit-service --max-messages 1 \
  --property print.key=true --property key.separator='|' \
  >"$consumer_output" 2>&1 &
consumer_pid=$!
sleep 4

printf '%s|%s\n' "$aggregate_id" "$event" | kafka_command kafka-console-producer.sh \
  --bootstrap-server "$bootstrap_servers" \
  --command-config "$work_dir/user.properties" \
  --topic user.events \
  --reader-property parse.key=true --reader-property key.separator='|' \
  --command-property enable.idempotence=true \
  --command-property acks=all

for _ in $(seq 1 20); do
  if ! kill -0 "$consumer_pid" 2>/dev/null; then
    break
  fi
  sleep 1
done
if kill -0 "$consumer_pid" 2>/dev/null; then
  kill "$consumer_pid" 2>/dev/null || true
  wait "$consumer_pid" 2>/dev/null || true
  echo "Authorized Credit consumer did not receive the test record" >&2
  cat "$consumer_output" >&2
  exit 1
fi
wait "$consumer_pid"
assert_contains "$(cat "$consumer_output")" "$aggregate_id|$event" "authorized keyed produce/consume"

ui_description=$(kafka_command kafka-topics.sh \
  --bootstrap-server "$bootstrap_servers" \
  --command-config "$work_dir/ui.properties" \
  --describe --topic user.events)
assert_contains "$ui_description" "PartitionCount: 3" "Kafka UI topic description"
ui_configuration=$(kafka_command kafka-configs.sh \
  --bootstrap-server "$bootstrap_servers" \
  --command-config "$work_dir/ui.properties" \
  --describe --entity-type topics --entity-name user.events)
assert_contains "$ui_configuration" "retention.ms=604800000" "Kafka UI topic configuration"

ui_consumer_output=$(timeout "$consumer_timeout" "$KAFKA_BIN_DIR/kafka-console-consumer.sh" \
  --bootstrap-server "$bootstrap_servers" \
  --consumer.config "$work_dir/ui.properties" \
  --topic user.events --from-beginning \
  --group "kafka-ui-browser-$event_id" --max-messages 1 \
  --property print.key=true --property key.separator='|' 2>&1)
assert_contains "$ui_consumer_output" "$aggregate_id|$event" "Kafka UI message read"

ui_acl_listing=$(kafka_command kafka-acls.sh "${admin[@]}" \
  --list --principal User:kafka_ui)
for forbidden_operation in WRITE CREATE DELETE ALTER ALTER_CONFIGS IDEMPOTENT_WRITE; do
  if grep -Eq "principal=User:kafka_ui, host=\\*, operation=$forbidden_operation," \
    <<< "$ui_acl_listing"; then
    echo "Kafka UI unexpectedly has $forbidden_operation permission" >&2
    exit 1
  fi
done

ui_offset_before=$(topic_end_offset order.events)
set +e
ui_unauthorized_write=$(printf '%s|{}\n' "$aggregate_id" | kafka_command kafka-console-producer.sh \
  --bootstrap-server "$bootstrap_servers" \
  --command-config "$work_dir/ui.properties" \
  --topic order.events \
  --sync \
  --reader-property parse.key=true --reader-property key.separator='|' \
  --command-property max.block.ms=5000 \
  --command-property delivery.timeout.ms=10000 2>&1)
ui_unauthorized_write_status=$?
set -e
sleep 2
ui_offset_after=$(topic_end_offset order.events)
if [ "$ui_offset_after" -ne "$ui_offset_before" ]; then
  echo "Kafka UI unexpectedly changed order.events from offset $ui_offset_before to $ui_offset_after" >&2
  exit 1
fi
if [ "$ui_unauthorized_write_status" -eq 0 ] && [ -n "$ui_unauthorized_write" ]; then
  echo "Kafka UI write was denied without changing order.events: $ui_unauthorized_write"
fi

set +e
ui_unauthorized_group=$(timeout "$denial_timeout" "$KAFKA_BIN_DIR/kafka-console-consumer.sh" \
  --bootstrap-server "$bootstrap_servers" \
  --consumer.config "$work_dir/ui.properties" \
  --topic user.events --group credit-service --max-messages 1 2>&1)
set -e
assert_contains "$ui_unauthorized_group" "GroupAuthorizationException" \
  "Kafka UI business consumer-group denial"

set +e
unauthorized_write=$(printf '%s|{}\n' "$aggregate_id" | kafka_command kafka-console-producer.sh \
  --bootstrap-server "$bootstrap_servers" \
  --command-config "$work_dir/credit.properties" \
  --topic user.events \
  --reader-property parse.key=true --reader-property key.separator='|' \
  --command-property max.block.ms=5000 \
  --command-property delivery.timeout.ms=10000 2>&1)
unauthorized_write_status=$?
set -e
if [ "$unauthorized_write_status" -eq 0 ] && [[ "$unauthorized_write" != *"TopicAuthorizationException"* ]]; then
  echo "Credit Service unexpectedly published to user.events" >&2
  exit 1
fi
assert_contains "$unauthorized_write" "TopicAuthorizationException" "unauthorized topic write denial"

set +e
unauthorized_group=$(timeout "$denial_timeout" "$KAFKA_BIN_DIR/kafka-console-consumer.sh" \
  --bootstrap-server "$bootstrap_servers" \
  --consumer.config "$work_dir/credit.properties" \
  --topic user.events --group order-service --max-messages 1 2>&1)
set -e
assert_contains "$unauthorized_group" "GroupAuthorizationException" "unauthorized consumer-group denial"

echo "Kafka topic, ACL, authorized-flow and denial checks passed."
