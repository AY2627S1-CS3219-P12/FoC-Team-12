# Chat Service on local Kubernetes

These manifests run the Chat Service with its private PostgreSQL database and a single-node,
persistent RabbitMQ broker in the existing `foc-local` Minikube namespace. This is a local/demo
topology, not a highly available broker cluster.

From the repository root, with Docker Desktop and `foc-local` running:

```bash
docker build -t foc-chat-service:local-323929b chat-service
docker build -t foc-gateway-service:local-323929b gateway-service
minikube -p foc-local image load foc-chat-service:local-323929b foc-gateway-service:local-323929b

# Preserves broker data, adds the Chat identity if missing and reruns topic/ACL initialization.
pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1
pwsh -File chat-service/k8s/New-ChatSecrets.ps1

kubectl --context=foc-local apply \
  -f chat-service/k8s/config.yaml \
  -f chat-service/k8s/database.yaml \
  -f chat-service/k8s/rabbitmq.yaml \
  -f chat-service/k8s/service.yaml \
  -f chat-service/k8s/deployment.yaml

kubectl --context=foc-local apply \
  -f deploy/k8s/network/policies.yaml \
  -f admin-service/k8s/network.yaml \
  -f chat-service/k8s/network.yaml

kubectl --context=foc-local apply -f gateway-service/k8s/deployment.yaml
kubectl --context=foc-local -n foc-local rollout status statefulset/chat-db --timeout=180s
kubectl --context=foc-local -n foc-local rollout status statefulset/rabbitmq --timeout=180s
kubectl --context=foc-local -n foc-local rollout status deployment/chat-service --timeout=300s
kubectl --context=foc-local -n foc-local rollout status deployment/gateway --timeout=300s
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service chat
```

The secret helpers preserve existing credentials and refuse to replace a missing Secret when its
persistent volume already exists. Do not commit generated credentials. `Apply-LocalKafka.ps1`
restarts the broker only when configuration or credential versions change, then reruns the
idempotent initializer so the `chat_service` ACL exists.

The RabbitMQ management page is intentionally not exposed through Gateway. For local inspection:

```bash
kubectl --context=foc-local -n foc-local port-forward service/rabbitmq 15672:15672 --address=127.0.0.1
```

The management login username is `chat_service`. Copy its password without printing it into
shared logs:

```bash
kubectl --context=foc-local -n foc-local get secret chat-service-secrets \
  -o jsonpath='{.data.RABBITMQ_PASSWORD}' | base64 --decode | pbcopy
```

Browse to `http://127.0.0.1:15672` and paste the password from the clipboard.
Stop the environment with `minikube stop -p foc-local`; do not delete the namespace, PVCs or
Secrets merely to stop it.
