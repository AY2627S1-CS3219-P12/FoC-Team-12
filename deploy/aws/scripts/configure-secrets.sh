#!/usr/bin/env bash
set -euo pipefail

region=${AWS_REGION:-ap-southeast-1}
environment=${FOC_ENVIRONMENT:-staging}
profile_args=()
if [[ -n ${AWS_PROFILE:-} ]]; then profile_args=(--profile "$AWS_PROFILE"); fi

for command in aws jq openssl base64; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

[[ -n ${SENDGRID_API_KEY:-} ]] || { echo 'Set SENDGRID_API_KEY in your shell; it will not be printed.' >&2; exit 1; }
[[ -n ${SENDGRID_FROM_EMAIL:-} ]] || { echo 'Set SENDGRID_FROM_EMAIL in your shell.' >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
chmod 700 "$tmp"

random_password() { openssl rand -base64 36 | tr -d '\n'; }
private_key() {
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null \
    | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 | tr -d '\n'
}
has_value() {
  aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
    --secret-id "$1" --query VersionId --output text >/dev/null 2>&1
}
put_file() {
  local name=$1 file=$2
  if has_value "$name"; then
    printf 'Preserved existing %s.\n' "$name"
    return
  fi
  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$file" >/dev/null
  printf 'Initialized %s.\n' "$name"
}

user_db=$(random_password)
supplier_db=$(random_password)
order_db=$(random_password)
credit_db=$(random_password)
admin_db=$(random_password)
jwt_key=$(private_key)
admin_key=$(private_key)
admin_public=$(printf '%s' "$admin_key" | openssl base64 -d -A \
  | openssl pkey -inform DER -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')
trusted_keys=$(jq -cn --arg key "$admin_public" \
  '{"admin-staging-1":{"subject":"admin-service","publicKey":$key}}')

jq -n --arg db "$user_db" --arg jwt "$jwt_key" --arg trust "$trusted_keys" \
  --arg email "${ADMIN_BOOTSTRAP_EMAIL:-}" --arg username "${ADMIN_BOOTSTRAP_USERNAME:-}" \
  --arg password "${ADMIN_BOOTSTRAP_PASSWORD:-}" \
  '{DB_PASSWORD:$db,JWT_PRIVATE_KEY:$jwt,USER_SERVICE_TRUSTED_KEYS:$trust}
   + (if $email == "" then {} else {ADMIN_BOOTSTRAP_EMAIL:$email,ADMIN_BOOTSTRAP_USERNAME:$username,ADMIN_BOOTSTRAP_PASSWORD:$password} end)' \
  > "$tmp/user.json"
jq -n --arg key "$SENDGRID_API_KEY" --arg from "$SENDGRID_FROM_EMAIL" \
  '{SENDGRID_API_KEY:$key,SENDGRID_FROM_EMAIL:$from}' > "$tmp/mail.json"
jq -n --arg value "$supplier_db" '{DB_PASSWORD:$value}' > "$tmp/supplier.json"
jq -n --arg value "$order_db" '{DB_PASSWORD:$value}' > "$tmp/order.json"
jq -n --arg value "$credit_db" '{DB_PASSWORD:$value}' > "$tmp/credit.json"
jq -n --arg db "$admin_db" --arg key "$admin_key" \
  '{ADMIN_DB_PASSWORD:$db,ADMIN_SERVICE_PRIVATE_KEY:$key,ADMIN_SERVICE_KEY_ID:"admin-staging-1",ADMIN_SERVICE_TRUSTED_KEYS:"{}"}' \
  > "$tmp/admin.json"
jq -n \
  --arg admin "$(random_password)" --arg broker "$(random_password)" \
  --arg user "$(random_password)" --arg order "$(random_password)" \
  --arg credit "$(random_password)" --arg adminService "$(random_password)" \
  --arg ui "$(random_password)" \
  '{KAFKA_ADMIN_PASSWORD:$admin,KAFKA_BROKER_PASSWORD:$broker,KAFKA_USER_SERVICE_PASSWORD:$user,
    KAFKA_ORDER_SERVICE_PASSWORD:$order,KAFKA_CREDIT_SERVICE_PASSWORD:$credit,
    KAFKA_ADMIN_SERVICE_PASSWORD:$adminService,KAFKA_UI_BROKER_PASSWORD:$ui}' > "$tmp/kafka.json"
jq -n --arg username kafka-viewer --arg password "$(random_password)" \
  '{KAFKA_UI_LOGIN_USERNAME:$username,KAFKA_UI_LOGIN_PASSWORD:$password}' > "$tmp/kafka-ui.json"

put_file "foc/$environment/user-service-secrets" "$tmp/user.json"
put_file "foc/$environment/user-mail-secrets" "$tmp/mail.json"
put_file "foc/$environment/supplier-service-secrets" "$tmp/supplier.json"
put_file "foc/$environment/order-service-secrets" "$tmp/order.json"
put_file "foc/$environment/credit-service-secrets" "$tmp/credit.json"
put_file "foc/$environment/admin-service-secrets" "$tmp/admin.json"
put_file "foc/$environment/kafka-broker-secrets" "$tmp/kafka.json"
put_file "foc/$environment/kafka-ui-secrets" "$tmp/kafka-ui.json"

echo 'Runtime secrets are initialized. Secret values were not printed or written to the repository.'
