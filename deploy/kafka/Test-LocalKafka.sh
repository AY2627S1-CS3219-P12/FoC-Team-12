#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
project_name=${COMPOSE_PROJECT_NAME:-foc-kafka-smoke-${USER:-local}}
keep_stack=${KEEP_KAFKA_SMOKE_STACK:-0}
failed=1

export USER_DB_NAME=${USER_DB_NAME:-kafka_smoke_user_db}
export USER_DB_USER=${USER_DB_USER:-kafka_smoke_user}
export USER_DB_PASSWORD=${USER_DB_PASSWORD:-not-used-kafka-smoke}
export SUPPLIER_DB_NAME=${SUPPLIER_DB_NAME:-kafka_smoke_supplier_db}
export SUPPLIER_DB_USER=${SUPPLIER_DB_USER:-kafka_smoke_supplier}
export SUPPLIER_DB_PASSWORD=${SUPPLIER_DB_PASSWORD:-not-used-kafka-smoke}
export CREDIT_DB_NAME=${CREDIT_DB_NAME:-kafka_smoke_credit_db}
export CREDIT_DB_USER=${CREDIT_DB_USER:-kafka_smoke_credit}
export CREDIT_DB_PASSWORD=${CREDIT_DB_PASSWORD:-not-used-kafka-smoke}
export JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY:-not-used-kafka-smoke}
export KAFKA_ADMIN_PASSWORD=${KAFKA_ADMIN_PASSWORD:-smoke-admin-password}
export KAFKA_BROKER_PASSWORD=${KAFKA_BROKER_PASSWORD:-smoke-broker-password}
export KAFKA_USER_SERVICE_PASSWORD=${KAFKA_USER_SERVICE_PASSWORD:-smoke-user-password}
export KAFKA_ORDER_SERVICE_PASSWORD=${KAFKA_ORDER_SERVICE_PASSWORD:-smoke-order-password}
export KAFKA_CREDIT_SERVICE_PASSWORD=${KAFKA_CREDIT_SERVICE_PASSWORD:-smoke-credit-password}

compose() {
  docker compose --project-directory "$repository_root" -p "$project_name" "$@"
}

cleanup() {
  if [ "$failed" -ne 0 ]; then
    echo "Kafka smoke verification failed; broker and initializer logs follow." >&2
    compose ps >&2 || true
    compose logs --no-color --tail=200 kafka kafka-init >&2 || true
  fi
  if [ "$keep_stack" != 1 ]; then
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  else
    echo "Kafka smoke stack retained as Compose project '$project_name'."
  fi
}
trap cleanup EXIT

compose config --quiet
compose up -d --wait kafka
compose run --rm kafka-init
compose run --rm kafka-init
compose exec -T kafka /bin/bash /opt/foc-kafka/verify.sh before-restart

compose restart kafka
compose up -d --wait kafka
compose exec -T kafka /bin/bash /opt/foc-kafka/verify.sh after-restart

failed=0
echo "Kafka smoke verification passed for Compose project '$project_name'."
