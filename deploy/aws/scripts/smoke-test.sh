#!/usr/bin/env bash
set -euo pipefail

: "${PUBLIC_URL:?PUBLIC_URL is required, for example https://example.cloudfront.net}"
base=${PUBLIC_URL%/}

retry() {
  local url=$1 expected=${2:-200}
  local code attempt
  for attempt in $(seq 1 6); do
    code=$(curl --silent --show-error --connect-timeout 3 --max-time 10 \
      --output /dev/null --write-out '%{http_code}' "$url" || true)
    [[ $code == "$expected" ]] && return 0
    echo "Attempt $attempt/6: expected HTTP $expected from $url, received ${code:-no response}." >&2
    sleep 5
  done
  echo "Expected HTTP $expected from $url, received ${code:-no response}." >&2
  return 1
}

retry "$base/" 200
retry "$base/actuator/health" 200
retry "$base/api/suppliers?page=0&size=1" 200
retry "$base/.well-known/jwks.json" 200
retry "$base/api/users/me" 401
retry "$base/api/admin/suppliers" 401
retry "$base/api/chat/preferences" 401
retry "$base/notifications" 200
retry "$base/api/notifications/me/unread-count" 401
echo "Cloud smoke checks passed at $base"
