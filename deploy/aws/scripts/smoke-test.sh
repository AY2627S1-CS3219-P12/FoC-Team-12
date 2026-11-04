#!/usr/bin/env bash
set -euo pipefail

: "${PUBLIC_URL:?PUBLIC_URL is required, for example https://example.cloudfront.net}"
base=${PUBLIC_URL%/}

retry() {
  local url=$1 expected=${2:-200}
  for _ in $(seq 1 60); do
    code=$(curl --silent --output /dev/null --write-out '%{http_code}' "$url" || true)
    [[ $code == "$expected" ]] && return 0
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
echo "Cloud smoke checks passed at $base"
