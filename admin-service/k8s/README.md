# Admin on local Minikube

Owner/editor: Darryl's approved Admin Kubernetes task. Jun Hui reviews shared gateway/network/
Kafka configuration; affected owners review their connection changes before merge. This adds no
domain interfaces or Chat implementation. User and gateway image updates package already existing
Admin support, preserving User's database, JWT signing key, mail configuration and other identities.

Use the existing `foc-local` profile and namespace, never the separate `minikube` profile. Resume
with `minikube start -p foc-local --driver=docker`. Do not delete profiles, PVCs or Secrets. The
regular Compose databases and this cluster's databases are independent; `.env` is not imported.

## Images and credentials

The manifests select local versioned images of repository revision `22bc8cc`, loaded into Minikube
instead of publishing or replacing a Docker Hub release tag. Build them if not already available:

```powershell
docker build -t foc-admin-service:local-22bc8cc admin-service
docker build -t foc-user-service:local-22bc8cc user-service
docker build -t foc-gateway-service:local-22bc8cc gateway-service
minikube -p foc-local image load --daemon foc-admin-service:local-22bc8cc foc-user-service:local-22bc8cc foc-gateway-service:local-22bc8cc
pwsh -File admin-service/k8s/New-AdminSecrets.ps1
pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1
```

Admin's helper creates missing private DB/signing credentials directly in Kubernetes, never in
Git/files/stdout. Existing storage without credentials fails closed. Repeated runs preserve the
same credentials. User receives only Admin's public key in `admin-user-trust`; existing trust
entries are retained and conflicting keys are rejected. User's existing private signing key is
never copied. Chat callback trust stays empty until Chat supplies its real public key; offline
Chat is not represented by a fake trusted identity or fixture server.

Kafka's existing helper adds only its missing `admin_service` password, preserving all other
broker/client/UI credentials. Existing clients must match or setup stops. Updating the shared
broker script/config requires a coordinated rolling restart of the one-broker local deployment;
the broker PVC, topics, ACLs and records remain. Initialization is idempotent. SASL_PLAINTEXT is
the team's current local convention, not encrypted production transport.

## Apply

Validate resources with `kubectl --context=foc-local apply --dry-run=server -f <file>` first.
The shared namespace default-deny/DNS policies and existing enforcement agent must already be
present. Apply both sides of new connections before starting Admin:

```powershell
kubectl --context=foc-local apply -f deploy/k8s/network/policies.yaml -f admin-service/k8s/network.yaml
kubectl --context=foc-local apply -f admin-service/k8s/config.yaml -f admin-service/k8s/database.yaml -f admin-service/k8s/service.yaml
kubectl --context=foc-local -n foc-local rollout status statefulset/admin-db --timeout=300s
kubectl --context=foc-local apply -f user-service/k8s/deployment.yaml -f gateway-service/k8s/deployment.yaml -f admin-service/k8s/deployment.yaml
kubectl --context=foc-local -n foc-local rollout status deployment/admin-service --timeout=600s
pwsh -File admin-service/k8s/Test-AdminDeployment.ps1 -CheckDatabaseRestart
pwsh -File deploy/k8s/network/Test-NetworkPolicies.ps1
```

PostgreSQL 16 uses one StatefulSet pod and retained 5Gi `data-admin-db-0`. Only Admin is allowed
to connect over ordinary pod networking. No NodePort exposes Admin or its DB. Startup/readiness
use health; Admin's TCP liveness checks process availability without a remote-dependency restart
loop. Kubernetes administrator exec/port-forward is outside NetworkPolicy isolation.

For this laptop, Admin/User/gateway JVMs cap their perceived processors at two and use tier-one
compilation to reduce startup contention. Rollouts permit a brief outage instead of an extra
replica (`maxSurge: 0`), with a ten-minute startup budget. The existing node's Docker CPU limit
was raised from two to four with user approval; this does not recreate the node or change storage.

The network helper includes both shared policies and Admin's network file for its disposable
positive/negative tests. Admin allows User checks/JWKS, Kafka, its own DB and the agreed future
Chat destination; Chat must still supply its own reverse policies/trust. No rule grants Admin
another service's database, direct Credit effects or blanket internet access.

## Gateway and manual check

Keep regular Compose on 8088. In another terminal use:

```powershell
kubectl --context=foc-local -n foc-local port-forward service/gateway 8089:8088 --address=127.0.0.1
```

Open `http://localhost:8089/`, sign in with an existing **cluster** account, then select Admin.
Compose/test-preview logins do not automatically exist here. Check `/admin`, queue filters and
normal return navigation; `/internal/**` must remain unavailable through the gateway. A participant
opening an errand-scoped report must see unavailable/retry while Chat is offline, not an eligible
form. Existing own reports can be read without Chat. No normal accounts/cases/evidence are seeded
for acceptance. Full real Chat reporting/resolution remains a separate producer dependency.

Restart verification replaces only `admin-db-0` and compares the retained claim UID and successful
migration records before/after; it does not insert dummy business rows. Consumer partition
assignment proves real authenticated broker connectivity, not Credit/User command completion.
No simulated outcome is a real-service acceptance result. Live results are recorded in the
integration readiness document once checks finish.

The initializer retries each idempotent create/config/ACL operation at most three times; exhausted
retries still fail the Job. Its bootstrap address is namespace-qualified and absolute, avoiding
short-name DNS search fallbacks. Early cold-start checks had DNS/timeout failures; final passes
do not establish that the entire local cluster is free from intermittent DNS/startup issues.

If Admin starts before broker ACL initialization completes, its existing listener stops on
authorization failure. Wait for the initializer to succeed, restart the Admin deployment with
`kubectl --context=foc-local -n foc-local rollout restart deployment/admin-service`, and verify
actual partition assignment.
HTTP readiness alone does not prove a running Kafka listener. This deployment does not change
Admin's backend error/retry logic.

Admin's DB/User/Chat/Kafka addresses and the gateway's Admin destination use absolute namespace
DNS names to avoid reproducing the cold-start short-name lookup failures. This is runtime
configuration only; it does not bypass service authentication or broaden network permissions.

## Case-event relay rollout prerequisites

The case-event delivery change prepares `ADMIN_CASE_EVENTS_ENABLED=true` and the stable
`ADMIN_CASE_EVENTS_TRANSACTION_ID=admin-case-events-v1`. Before activating a new Admin image,
obtain affected-owner review and run the reviewed broker initializer to create `admin.events`
and grant Admin topic Write/Describe plus Write/Describe on the `admin-case-events-` transaction
prefix. The existing Admin-to-Kafka network policy already permits this broker connection.
Do not apply only the enabled flag to an old image or infer delivery from HTTP readiness.

`./admin-service/k8s/Check-CaseEventConfiguration.ps1 -Profile foc-local`
reads deployed image/config and broker topic/ACL metadata without modifying the cluster.
It fails with a list of missing prerequisites. Passing metadata checks alone does not prove the
image implements delivery or that Chat consumes it. The checked cluster still has the previous
image and lacks these new settings/topic/ACLs; no case-event rollout was performed in this task.

All replicas using one database share a stable transaction ID; a separate database using the
same broker needs its own ID under the allowed prefix. Chat must consume with `read_committed`
and deduplicate event IDs. PostgreSQL/Kafka crash recovery can repeat original events.
