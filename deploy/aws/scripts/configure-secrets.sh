#!/usr/bin/env bash
set -euo pipefail

region=${AWS_REGION:-ap-southeast-1}
environment=${FOC_ENVIRONMENT:-staging}
profile_args=()
if [[ -n ${AWS_PROFILE:-} ]]; then profile_args=(--profile "$AWS_PROFILE"); fi

for command in aws jq openssl base64; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

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
merge_missing_fields() {
  local name=$1 file=$2
  local current="$tmp/current-kafka.json"
  local merged="$tmp/merged-kafka.json"

  if ! has_value "$name"; then
    put_file "$name" "$file"
    return
  fi

  aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
    --secret-id "$name" --query SecretString --output text > "$current"
  # Start with the generated complete shape, then overlay the existing object so every current
  # credential wins. Only fields absent from an older secret receive newly generated values.
  jq -s '.[1] * .[0]' "$current" "$file" > "$merged"
  if cmp -s "$current" "$merged"; then
    printf 'Preserved existing %s; all required fields are present.\n' "$name"
    return
  fi

  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$merged" >/dev/null
  printf 'Added missing fields to %s without rotating existing credentials.\n' "$name"
}
put_or_update_user_secret() {
  local name=$1 file=$2
  local current="$tmp/current-user.json"
  local merged="$tmp/merged-user.json"

  if ! has_value "$name"; then
    put_file "$name" "$file"
    return
  fi
  if [[ -z ${ADMIN_BOOTSTRAP_EMAIL:-} ]]; then
    printf 'Preserved existing %s.\n' "$name"
    return
  fi

  aws "${profile_args[@]}" --region "$region" secretsmanager get-secret-value \
    --secret-id "$name" --query SecretString --output text > "$current"
  # Bootstrap identity is the only explicitly replaceable portion of this secret. Database and
  # signing credentials always come from the existing AWS value and are never rotated here.
  jq -s '.[0] * (.[1] | {
      ADMIN_BOOTSTRAP_EMAIL,
      ADMIN_BOOTSTRAP_USERNAME,
      ADMIN_BOOTSTRAP_PASSWORD
    })' "$current" "$file" > "$merged"
  if jq -e --slurpfile merged "$merged" '. == $merged[0]' "$current" >/dev/null; then
    printf 'Preserved existing %s; bootstrap identity already matches.\n' "$name"
    return
  fi

  aws "${profile_args[@]}" --region "$region" secretsmanager put-secret-value \
    --secret-id "$name" --secret-string "file://$merged" >/dev/null
  printf 'Updated the bootstrap identity in %s without rotating other credentials.\n' "$name"
}

mail_secret="foc/$environment/user-mail-secrets"
if ! has_value "$mail_secret"; then
  [[ -n ${SENDGRID_API_KEY:-} ]] || { echo 'Set SENDGRID_API_KEY in your shell; it will not be printed.' >&2; exit 1; }
  [[ -n ${SENDGRID_FROM_EMAIL:-} ]] || { echo 'Set SENDGRID_FROM_EMAIL in your shell.' >&2; exit 1; }
fi

bootstrap_count=0
for value in "${ADMIN_BOOTSTRAP_EMAIL:-}" "${ADMIN_BOOTSTRAP_USERNAME:-}" "${ADMIN_BOOTSTRAP_PASSWORD:-}"; do
  [[ -z $value ]] || bootstrap_count=$((bootstrap_count + 1))
done
if (( bootstrap_count != 0 && bootstrap_count != 3 )); then
  echo 'Set ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_USERNAME, and ADMIN_BOOTSTRAP_PASSWORD together.' >&2
  exit 1
fi
if (( bootstrap_count == 3 )); then
  normalized_email=$(printf '%s' "$ADMIN_BOOTSTRAP_EMAIL" | tr '[:upper:]' '[:lower:]')
  case "$normalized_email" in
    *@u.nus.edu|*@u.duke.nus.edu|*@u.yale-nus.edu.sg) ;;
    *) echo 'ADMIN_BOOTSTRAP_EMAIL must use an eligible NUS student domain.' >&2; exit 1 ;;
  esac
  (( ${#ADMIN_BOOTSTRAP_USERNAME} >= 1 && ${#ADMIN_BOOTSTRAP_USERNAME} <= 20 )) \
    || { echo 'ADMIN_BOOTSTRAP_USERNAME must be between 1 and 20 characters.' >&2; exit 1; }
  (( ${#ADMIN_BOOTSTRAP_PASSWORD} >= 15 && ${#ADMIN_BOOTSTRAP_PASSWORD} <= 64 )) \
    || { echo 'ADMIN_BOOTSTRAP_PASSWORD must be between 15 and 64 characters.' >&2; exit 1; }
fi

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
if has_value "$mail_secret"; then
  printf '{}\n' > "$tmp/mail.json"
else
  jq -n --arg key "$SENDGRID_API_KEY" --arg from "$SENDGRID_FROM_EMAIL" \
    '{SENDGRID_API_KEY:$key,SENDGRID_FROM_EMAIL:$from}' > "$tmp/mail.json"
fi
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
  --arg chat "$(random_password)" --arg notification "$(random_password)" \
  --arg ui "$(random_password)" \
  '{KAFKA_ADMIN_PASSWORD:$admin,KAFKA_BROKER_PASSWORD:$broker,KAFKA_USER_SERVICE_PASSWORD:$user,
    KAFKA_ORDER_SERVICE_PASSWORD:$order,KAFKA_CREDIT_SERVICE_PASSWORD:$credit,
    KAFKA_ADMIN_SERVICE_PASSWORD:$adminService,KAFKA_CHAT_SERVICE_PASSWORD:$chat,
    KAFKA_NOTIFICATION_SERVICE_PASSWORD:$notification,KAFKA_UI_BROKER_PASSWORD:$ui}' > "$tmp/kafka.json"
jq -n --arg username kafka-viewer --arg password "$(random_password)" \
  '{KAFKA_UI_LOGIN_USERNAME:$username,KAFKA_UI_LOGIN_PASSWORD:$password}' > "$tmp/kafka-ui.json"

put_or_update_user_secret "foc/$environment/user-service-secrets" "$tmp/user.json"
put_file "$mail_secret" "$tmp/mail.json"
put_file "foc/$environment/supplier-service-secrets" "$tmp/supplier.json"
put_file "foc/$environment/order-service-secrets" "$tmp/order.json"
put_file "foc/$environment/credit-service-secrets" "$tmp/credit.json"
put_file "foc/$environment/admin-service-secrets" "$tmp/admin.json"
merge_missing_fields "foc/$environment/kafka-broker-secrets" "$tmp/kafka.json"
put_file "foc/$environment/kafka-ui-secrets" "$tmp/kafka-ui.json"

echo 'Runtime secrets are initialized. Secret values were not printed or written to the repository.'
