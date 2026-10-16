# User Service on local Kubernetes

This is the first verified increment of the course's Minikube/Docker workflow. The application
image packages the User React frontend and Spring Boot backend. PostgreSQL has one StatefulSet
replica and a retained 5Gi PVC; application replicas share that database and the same signing key.

## Start or resume

Run Docker Desktop in Linux-container mode, then from the repository root in Git Bash:

```bash
minikube start -p foc-local --driver=docker
minikube -p foc-local kubectl -- --context=foc-local get nodes
```

Use the explicit context even when another Minikube profile is running. The namespace is also
named `foc-local`; the cluster profile and namespace are separate objects.

For a fresh cluster, create the namespace and local secret (the existing cluster already has it):

```bash
minikube -p foc-local kubectl -- --context=foc-local create namespace foc-local
minikube -p foc-local kubectl -- --context=foc-local -n foc-local create secret generic user-service-secrets \
  --from-file=DB_PASSWORD=user-service/k8s/db-password.key \
  --from-file=JWT_PRIVATE_KEY=user-service/k8s/jwt-private.key
```

The two `.key` files are ignored by Git. Generate a random password and Base64-encoded PKCS#8 RSA
private key for a new environment; do not rotate them merely to redeploy. The database password
must match the initialized PostgreSQL data. Never commit key files or exported Secret manifests.

```bash
minikube -p foc-local kubectl -- --context=foc-local apply -f user-service/k8s/database.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status statefulset/user-db --timeout=180s
minikube -p foc-local kubectl -- --context=foc-local apply -f user-service/k8s/deployment.yaml
minikube -p foc-local kubectl -- --context=foc-local apply -f user-service/k8s/service.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/user-service --timeout=300s
minikube -p foc-local service user-service -n foc-local
```

Keep the service tunnel open on Windows. Use one browser address throughout a login session;
session storage belongs to its origin. This direct User NodePort supports the tutorial; use the
gateway entry point once the shared stack is deployed.

## Verification and persistence

Check `/`, `/actuator/health`, `/.well-known/jwks.json` and that `/api/users/me` returns `401`
without a token. Startup and readiness use the existing health endpoint. PostgreSQL availability
does not drive an application liveness restart loop.

With `MAIL_PROVIDER=noop`, registration creates an UNVERIFIED account but sends no email; the
full verification/login demo requires working SendGrid configuration supplied through Secrets.
Do not bypass verification by changing application account data during infrastructure testing.

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local exec user-db-0 -- \
  psql -U user_user -d user_db -c 'SELECT COUNT(*) FROM users;'
```

Record the count, deliberately replace only `user-db-0`, wait for its replacement to become ready,
and repeat the query. The count and PVC UID should remain unchanged. A backup/restore test gives
stronger protection than a restart test alone.

`minikube stop -p foc-local` pauses the cluster. Do not delete the profile, PVC or namespace to
stop applications: local storage can be lost. StatefulSet retention preserves claims when the
StatefulSet is removed; it does not make explicit PVC deletion safe. Compose volumes are separate
and are never imported automatically.
