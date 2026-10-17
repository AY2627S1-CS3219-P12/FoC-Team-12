#!/usr/bin/env bash

KAFKA_BIN_DIR=${KAFKA_BIN_DIR:-/opt/kafka/bin}

require_env() {
  local name=$1
  if [ -z "${!name:-}" ]; then
    echo "Required environment variable $name is not set" >&2
    return 1
  fi
}

jaas_escape() {
  local value=$1
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "Kafka credentials must not contain line breaks" >&2
    return 1
  fi
  printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_client_properties() {
  local path=$1
  local username=$2
  local password=$3
  local escaped_username
  local escaped_password

  escaped_username=$(jaas_escape "$username")
  escaped_password=$(jaas_escape "$password")
  umask 077
  cat > "$path" <<EOF
security.protocol=SASL_PLAINTEXT
sasl.mechanism=PLAIN
sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="$escaped_username" password="$escaped_password";
EOF
}

kafka_command() {
  "$KAFKA_BIN_DIR/$1" "${@:2}"
}
