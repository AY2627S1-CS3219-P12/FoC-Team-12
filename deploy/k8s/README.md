# Local Kubernetes (Minikube)

This setup follows the [course guide](https://sds-edu.github.io/SDS-Kubernetes-Guide/): Minikube
with the Docker driver, YAML Deployments/Services, NodePort access and explicit scaling/rollouts.
Docker Desktop's own Kubernetes feature is not needed. Cloud and Kafka transport are separate work.

Shared editor: Darryl's Kubernetes task. Each service owner reviews their deployment; Jun Hui
reviews gateway/shared networking. Databases and credentials remain service-private.

## Cluster and images

Start Docker Desktop with Linux containers, then use Git Bash from the repository root:

```bash
minikube start -p foc-local --driver=docker
minikube -p foc-local kubectl -- --context=foc-local get nodes
minikube -p foc-local kubectl -- --context=foc-local apply -f deploy/k8s/namespace.yaml
```

Resume the existing profile without deleting it. The default `minikube` profile is a different
cluster; commands explicitly select `foc-local`.

All Deployments use versioned Docker Hub images under `arkanian4`, following section 2 of the
course guide. Publishing uploads application images, not running containers, database data or
Kubernetes Secrets. The image publisher runs:

```bash
docker login
docker build -t arkanian4/foc-gateway-service:d3-2 gateway-service
docker push arkanian4/foc-gateway-service:d3-2
```

Repeat the build/push pattern for each service, using the tag in its Deployment. Teammates using
the published images do not need to build or push. Kubernetes downloads them on first use;
`IfNotPresent` reuses cached images. Use a new tag for changed builds, update the Deployment and
apply it again. Do not replace a published release tag. Public repositories allow teammates to
pull without credentials; private repositories additionally require an `imagePullSecret`.

| Component | Published image |
| --- | --- |
| User | `arkanian4/foc-user-service:d3-1` |
| Gateway | `arkanian4/foc-gateway-service:d3-2` |
| Supplier | `arkanian4/foc-supplier-service:d3-1` |
| Credit | `arkanian4/foc-credit-service:d3-1` |
| Order | `arkanian4/foc-order-service:d3-1` |

Runtime passwords/signing keys are created separately in each teammate's cluster. They are not
included in images or Git. Never add them to application resources or frontend build settings.

## Incremental deployment

Start with [User Service](../../user-service/k8s/README.md), including its local secrets.
Then deploy the gateway:

```bash
minikube -p foc-local kubectl -- --context=foc-local apply -f gateway-service/k8s
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/gateway --timeout=300s
minikube -p foc-local service gateway -n foc-local
```

Keep the tunnel open on Windows. Gateway health does not mean all downstreams are deployed;
check their routes independently. Missing services can fail on their own routes while User pages
work. Use the gateway as the normal browser entry once available.

For a stable origin throughout a login session, run in a separate terminal:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local port-forward service/gateway 8088:8088
```

Open `http://localhost:8088`. If Compose occupies that port, stop only its gateway or choose
another local port. All packaged frontends must use the same browser origin to share the session.
Port-forward attaches to one pod; reopen it after a rollout replaces that pod.

Continue one service at a time: [Supplier](../../supplier-service/k8s/README.md),
[Credit](../../credit-service/k8s/README.md), then [Order](../../order-service/k8s/README.md).
Their guides create private credentials, wait for their databases, deploy and verify independently.
All three use cluster-internal Services rather than extra public NodePorts; the gateway is the
normal entry. User's NodePort remains available for the original manual exercise.

## Updates, scaling and future Order work

Use one application replica initially to fit a local laptop. This is a chosen starting count,
not an autoscaling rule. Practice the guide's scale/rollout commands on the stateless gateway:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local scale deployment/gateway --replicas=2
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/gateway --timeout=300s
minikube -p foc-local kubectl -- --context=foc-local -n foc-local get pods -l app=gateway
minikube -p foc-local kubectl -- --context=foc-local -n foc-local scale deployment/gateway --replicas=1
```

For a release, build/push a new image tag, update the service's Deployment YAML and apply it.
Use `rollout status`, `rollout history` and, for an application regression, `rollout undo`.
Reflect a rollback in the YAML too; otherwise the next apply reinstates the bad release.
Image rollback does not roll back database migrations: check compatibility before rollback.
Never scale a PostgreSQL StatefulSet to create database replicas without a replication design.

Order already has stable DNS, PostgreSQL storage, JWT settings and `/api/orders/**` gateway
forwarding. Future endpoints under that prefix need an Order image update, not new gateway
routes. A future separate frontend path needs a deliberate route. Kafka listener/publisher
adapters will require coordinated broker deployment and connection configuration; this cluster
does not pretend those integrations already exist. Credit uses no demo profile here.

The smoke checks cover deployment, public routes, missing/invalid-token rejection and retained
migration records. They do not prove authenticated business flows or ledger/event integration.
User's default `MAIL_PROVIDER=noop` does not deliver verification codes: configure the documented
mail provider with local Secrets before testing new-account login; do not bypass verification.

## Recovery and data

Each PostgreSQL StatefulSet remains at one replica and uses its own retained claim from Minikube's
default StorageClass. Claim retention is not a backup: deleting a PVC/profile may remove data.
Compose volumes are independent.

Stop with `minikube stop -p foc-local`; do not delete the namespace/profile to stop workloads.
Keep signing/database secrets stable. Never commit key files or exported Secret YAML, and do not
change an initialized PostgreSQL password by merely replacing its Kubernetes Secret.

Startup/readiness use each application's existing `/actuator/health`. Applications can retry
after initial database/DNS startup failures. Avoid dependency-based liveness restart loops.
Use `get pods`, `describe pod` and `logs` in `foc-local` to diagnose failures.
