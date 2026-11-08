#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=ap-southeast-1}"
: "${EKS_CLUSTER_NAME:=foc-staging}"
: "${RDS_HOST:?RDS_HOST is required}"
: "${RDS_MASTER_SECRET_ARN:?RDS_MASTER_SECRET_ARN is required}"
: "${ALB_SECURITY_GROUP_ID:?ALB_SECURITY_GROUP_ID is required}"
: "${EXTERNAL_SECRETS_ROLE_ARN:?EXTERNAL_SECRETS_ROLE_ARN is required}"
: "${GATEWAY_IMAGE:?GATEWAY_IMAGE is required}"
: "${USER_IMAGE:?USER_IMAGE is required}"
: "${SUPPLIER_IMAGE:?SUPPLIER_IMAGE is required}"
: "${ORDER_IMAGE:?ORDER_IMAGE is required}"
: "${CREDIT_IMAGE:?CREDIT_IMAGE is required}"
: "${ADMIN_IMAGE:?ADMIN_IMAGE is required}"

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
profile_args=()
if [[ -n ${AWS_PROFILE:-} ]]; then profile_args=(--profile "$AWS_PROFILE"); fi

aws "${profile_args[@]}" --region "$AWS_REGION" eks update-kubeconfig --name "$EKS_CLUSTER_NAME" >/dev/null

sed "s|RDS_HOST_REPLACED_BY_DEPLOY_SCRIPT|$RDS_HOST|g" \
  "$root/deploy/aws/k8s/staging/namespace-storage.yaml" | kubectl apply -f -

helm repo add external-secrets https://charts.external-secrets.io >/dev/null
helm repo update external-secrets >/dev/null
helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace --wait --timeout 10m \
  --set serviceAccount.name=external-secrets \
  --set-string "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn=$EXTERNAL_SECRETS_ROLE_ARN"

export AWS_REGION RDS_HOST RDS_MASTER_SECRET_ARN ALB_SECURITY_GROUP_ID
export GATEWAY_IMAGE USER_IMAGE SUPPLIER_IMAGE ORDER_IMAGE CREDIT_IMAGE ADMIN_IMAGE
rendered=$(mktemp)
trap 'rm -f "$rendered"' EXIT
"$root/deploy/aws/scripts/render-k8s.sh" > "$rendered"

# Apply secret synchronization before workloads so missing credentials fail early.
awk 'BEGIN{RS="---"} /kind: (ClusterSecretStore|ExternalSecret)/ {print $0 "---"}' "$rendered" | kubectl apply -f -
for name in user-service-secrets user-mail-secrets supplier-service-secrets order-service-secrets \
  credit-service-secrets admin-service-secrets kafka-broker-secrets kafka-ui-secrets rds-master; do
  if ! kubectl -n foc-staging wait --for=condition=Ready "externalsecret/$name" --timeout=5m; then
    echo "External Secret $name did not become ready; collecting diagnostics." >&2
    kubectl get clustersecretstore aws-secrets-manager -o wide || true
    kubectl -n foc-staging get externalsecrets -o wide || true
    kubectl -n foc-staging describe "externalsecret/$name" || true
    kubectl -n external-secrets logs deployment/external-secrets --tail=200 || true
    exit 1
  fi
done

kubectl -n foc-staging delete job database-bootstrap --ignore-not-found
kubectl apply -f "$root/deploy/aws/k8s/staging/database-bootstrap.yaml"
kubectl -n foc-staging wait --for=condition=complete job/database-bootstrap --timeout=15m

kubectl -n foc-staging create configmap kafka-scripts \
  --from-file=lib.sh="$root/deploy/kafka/lib.sh" \
  --from-file=broker-entrypoint.sh="$root/deploy/kafka/broker-entrypoint.sh" \
  --from-file=healthcheck.sh="$root/deploy/kafka/healthcheck.sh" \
  --from-file=initialize.sh="$root/deploy/kafka/initialize.sh" \
  --from-file=verify.sh="$root/deploy/kafka/verify.sh" \
  --from-file=probe.sh="$root/deploy/kafka/k8s/probe.sh" \
  --dry-run=client -o yaml | kubectl apply -f -

cli_dir=$(mktemp -d)
trap 'rm -f "$rendered"; rm -rf "$cli_dir"' EXIT
for name in kafka-topics.sh kafka-configs.sh kafka-acls.sh kafka-broker-api-versions.sh \
  kafka-console-producer.sh kafka-console-consumer.sh kafka-get-offsets.sh; do
  cp "$root/deploy/kafka/k8s/cli.sh" "$cli_dir/$name"
done
kubectl -n foc-staging create configmap kafka-cli --from-file="$cli_dir" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$rendered"
kubectl -n foc-staging rollout status statefulset/kafka --timeout=20m

job="kafka-init-$(date +%s)"
sed "s/name: kafka-init/name: $job/" "$root/deploy/kafka/k8s/initialize-job.yaml" \
  | kubectl -n foc-staging create -f -
kubectl -n foc-staging wait --for=condition=complete "job/$job" --timeout=20m

for deployment in user-service supplier-service order-service credit-service admin-service gateway kafka-ui; do
  kubectl -n foc-staging rollout status "deployment/$deployment" --timeout=20m
done

kubectl -n foc-staging get ingress gateway
echo 'Staging workloads are healthy. The private ALB may need several minutes to become Active.'
