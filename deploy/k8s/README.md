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
docker build -t arkanian4/foc-gateway-service:d3-1 gateway-service
docker push arkanian4/foc-gateway-service:d3-1
```

Repeat the build/push pattern for each service, using the tag in its Deployment. Teammates using
the published images do not need to build or push. Kubernetes downloads them on first use;
`IfNotPresent` reuses cached images. Use a new tag for changed builds, update the Deployment and
apply it again. Do not replace a published release tag. Public repositories allow teammates to
pull without credentials; private repositories additionally require an `imagePullSecret`.

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
