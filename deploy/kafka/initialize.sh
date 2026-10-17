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

add_topic_acl() {
  local principal=$1
  local operation=$2
  local topic=$3
  kafka_command kafka-acls.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --add --allow-principal "User:$principal" \
    --operation "$operation" --topic "$topic"
}

add_group_acl() {
  local principal=$1
  local group=$2
  kafka_command kafka-acls.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --add --allow-principal "User:$principal" \
    --operation Read --group "$group"
}

add_idempotent_write_acl() {
  local principal=$1
  kafka_command kafka-acls.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --add --allow-principal "User:$principal" \
    --operation IdempotentWrite --cluster
}

for topic in user.events order.events credit.events; do
  create_topic "$topic" 3 604800000
done

for topic in user.events.DLT order.events.DLT credit.events.DLT; do
  create_topic "$topic" 1 2592000000
done

# User Service publishes activation facts.
add_topic_acl user_service Write user.events
add_topic_acl user_service Describe user.events
add_idempotent_write_acl user_service

# Order Service publishes lifecycle facts and consumes Credit outcomes.
add_topic_acl order_service Write order.events
add_topic_acl order_service Describe order.events
add_topic_acl order_service Read credit.events
add_topic_acl order_service Describe credit.events
add_group_acl order_service order-service
add_topic_acl order_service Write credit.events.DLT
add_topic_acl order_service Describe credit.events.DLT
add_idempotent_write_acl order_service

# Credit Service consumes User/Order facts and publishes outcomes.
for topic in user.events order.events; do
  add_topic_acl credit_service Read "$topic"
  add_topic_acl credit_service Describe "$topic"
done
add_group_acl credit_service credit-service
for topic in credit.events user.events.DLT order.events.DLT; do
  add_topic_acl credit_service Write "$topic"
  add_topic_acl credit_service Describe "$topic"
done
add_idempotent_write_acl credit_service

echo "Kafka topics and ACLs are initialized. Re-running this initializer is safe."
