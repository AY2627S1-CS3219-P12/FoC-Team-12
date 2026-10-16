# Order Service on Minikube

Owner review: XueTing. Shared setup and Docker Hub publishing are in
[the cluster guide](../../deploy/k8s/README.md). Complete its namespace, User and gateway steps first.

The Deployment downloads `arkanian4/foc-order-service:d3-1` from Docker Hub. No local build is
needed to use the published release. Application port: 8082; the Service is cluster-internal.

From the repository root, create the private password once (PowerShell 7.2+):

```powershell
./deploy/k8s/New-DatabaseSecret.ps1 -Service order
```

The helper preserves an existing Secret and never prints/saves the password. If an existing
database claim has lost its Secret, recover its original credentials; do not generate a new
password for an initialized database. In Git Bash, invoke the helper with `pwsh -File`.

Deploy and wait for PostgreSQL before starting the application (Git Bash):

```bash
minikube -p foc-local kubectl -- --context=foc-local apply -f order-service/k8s/database.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status statefulset/order-db --timeout=180s
minikube -p foc-local kubectl -- --context=foc-local apply -f order-service/k8s/config.yaml -f order-service/k8s/service.yaml -f order-service/k8s/deployment.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/order-service --timeout=300s
```

Verify health, documentation, authorization rejection and the database (PowerShell):

```powershell
./deploy/k8s/Test-LocalDeployment.ps1 -Service order
# Optional: replaces ONLY the database pod and checks that migrations/PVC survive.
./deploy/k8s/Test-LocalDeployment.ps1 -Service order -CheckDatabaseRestart
```

Only the currently implemented order-creation API is deployed. Creation persists `PENDING_CREDIT`; Kafka transport and later lifecycle transitions remain separate work. This service has no packaged frontend.

The application reads only its own database and validates User JWTs via the internal public
JWKS endpoint. No User signing key is copied here. The PostgreSQL StatefulSet uses a retained
5 GiB claim; keep the database at one replica. This is single-node persistence, not high
availability or backup. Stop Minikube to pause work; never delete the claim to restart a service.
