# AWS staging deployment (Cloud Deployment N2H)

This directory defines the disposable AWS staging environment for Friend on Campus. Terraform
creates AWS infrastructure, Kustomize defines the Kubernetes runtime, and GitHub Actions builds
immutable ECR images and deploys them through GitHub OIDC. Compose and Minikube remain the normal
local development environments.

Jun Hui is the nominated editor for this Cloud Deployment N2H iteration. Gateway, User, Supplier,
Order, Credit and Admin owners must review changes affecting their image, runtime configuration or
route contract before merge.

## Architecture

```text
Browser
  -> CloudFront HTTPS hostname
  -> private ALB VPC origin
  -> Gateway ClusterIP
  -> User / Supplier / Order / Credit / Admin ClusterIP services
                                      |
                     private RDS PostgreSQL (five databases/users)

User / Order / Credit / Admin <-> Kafka StatefulSet on encrypted EBS
External Secrets Operator     <-> AWS Secrets Manager through EKS IRSA
Pods and EKS control plane    -> CloudWatch logs, metrics, dashboard and alarms
```

External Secrets and the CloudWatch add-on use IAM Roles for Service Accounts (IRSA): their
Kubernetes service accounts exchange EKS-issued OIDC tokens for short-lived AWS credentials.
The NUS AWS organization explicitly denies the newer EKS Pod Identity API, so this environment
uses IRSA instead. No long-lived AWS keys are stored in Kubernetes or GitHub.

Only CloudFront is public. The ALB is internal, RDS is private, Kafka has no public listener and
application Services are `ClusterIP`. The EKS API has a public authenticated endpoint because
GitHub-hosted runners have changing addresses; access is still limited to EKS access entries for
the two OIDC roles.

The staging defaults deliberately minimize cost rather than provide production high availability:
one NAT Gateway, one `db.t4g.micro` RDS instance and one Kafka broker with replication factor one.
EKS Auto Mode may add/remove compute capacity for scheduled pods. The USD 25 budget is an alert,
not a hard spending limit. Stop or destroy staging when it is not being demonstrated.

## Directory map

| Path | Purpose |
| --- | --- |
| `terraform/bootstrap` | State bucket consumer, GitHub OIDC provider and workflow roles |
| `terraform/staging-core` | VPC, NAT, EKS, ECR, RDS, secret containers, monitoring and budget |
| `terraform/staging-edge` | CloudFront VPC origin, distribution and edge alarm |
| `k8s/staging` | AWS runtime overlay, workloads, HPA, private ingress and secret projection |
| `scripts` | State bootstrap, secret initialization, deployment, smoke/load tests and ALB discovery |

Terraform owns secret *containers* only. Secret values are created directly in Secrets Manager by
`configure-secrets.sh`, so plaintext values do not enter Terraform input, state, Git or workflow
logs. External Secrets Operator projects only each workload's required values into Kubernetes.

## Prerequisites and authentication

Install Terraform 1.14+, AWS CLI v2, Docker, `kubectl`, Helm 3 and `jq`. Configure an AWS SSO
profile; never create or paste long-lived access keys for this project.

```bash
aws configure sso --profile foc-staging-admin
aws sso login --profile foc-staging-admin
aws sts get-caller-identity --profile foc-staging-admin
export AWS_PROFILE=foc-staging-admin
export AWS_REGION=ap-southeast-1
```

The authenticated identity needs enough one-time authority to create the state bucket, OIDC
provider and scoped roles, then to bootstrap the initial Terraform stacks. Subsequent GitHub jobs
use short-lived OIDC sessions instead of stored AWS credentials.

## One-time bootstrap

1. Create the encrypted, versioned state bucket and ignored local backend files:

   ```bash
   deploy/aws/scripts/bootstrap-state.sh
   ```

2. Initialize and apply the bootstrap stack. Use this repository's exact `owner/repository` name.
   The committed owner and repository IDs match GitHub's immutable OIDC subject for this repository;
   a fork or replacement repository must override all three values:

   ```bash
   terraform -chdir=deploy/aws/terraform/bootstrap init \
     -backend-config="$PWD/.aws-local/bootstrap-backend.hcl"
   terraform -chdir=deploy/aws/terraform/bootstrap apply \
     -var-file="$PWD/.aws-local/bootstrap.tfvars" \
     -var="github_repository=AY2627S1-CS3219-P12/FoC-Team-12"
   terraform -chdir=deploy/aws/terraform/bootstrap output
   ```

   Re-run this bootstrap `apply` after an approved change to either GitHub workflow role. The
   operation updates the scoped IAM policies in place; it does not recreate the staging cluster.

   If the AWS account already has a GitHub Actions OIDC provider, import that provider instead of
   creating a duplicate. The trust conditions accept only this repository's immutable GitHub owner
   and repository IDs and the named protected GitHub environments. Find replacement IDs through
   GitHub's repository API and pass `github_repository_owner_id` and `github_repository_id` when
   bootstrapping a different repository.

3. In GitHub, create protected environments `aws-staging-infra` and `aws-staging-deploy`. Require
   an approver for infrastructure. Add these repository/environment variables:

   | Variable | Value |
   | --- | --- |
   | `AWS_INFRA_ROLE_ARN` | `github_infra_role_arn` bootstrap output |
   | `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` bootstrap output |
   | `AWS_BUDGET_EMAIL` | Address receiving AWS Budget alerts |
   | `AWS_STAGING_ENABLED` | Keep `false` until the first full deployment succeeds |

4. Run **AWS staging infrastructure -> apply-core** manually and approve it. Review a
   **plan-core** run first. This creates chargeable resources.

   The core stack creates a tiny `foc-capacity-bootstrap/capacity-bootstrap` pause workload before
   installing node-dependent add-ons. Its only purpose is to make a new EKS Auto Mode cluster
   provision initial compute deterministically; application workloads still control meaningful
   capacity and scaling.

5. Initialize runtime values from a trusted workstation. The SendGrid values are read from shell
   variables and are never printed. Optional bootstrap-admin values are handled the same way.

   ```bash
   export SENDGRID_API_KEY='set-locally'
   export SENDGRID_FROM_EMAIL='verified@example.com'
   export ADMIN_BOOTSTRAP_EMAIL='student-id@u.nus.edu'
   export ADMIN_BOOTSTRAP_USERNAME='optional-admin'
   export ADMIN_BOOTSTRAP_PASSWORD='optional-strong-password'
   deploy/aws/scripts/configure-secrets.sh
   unset SENDGRID_API_KEY SENDGRID_FROM_EMAIL ADMIN_BOOTSTRAP_PASSWORD
   ```

   Re-running the helper preserves existing secret versions. Supplying all three
   `ADMIN_BOOTSTRAP_*` values explicitly updates only the bootstrap identity, which provides a
   safe repair path for an invalid initial address without rotating database or signing keys.
   The helper rejects bootstrap addresses outside the eligible NUS student domains before writing
   them. Rotate any other value with an explicit `aws secretsmanager put-secret-value --secret-id
   ... --secret-string file://...` command, then restart only the affected deployment so External
   Secrets can project the new version.

   The helper also migrates an existing Kafka broker secret forward when new service identities
   are introduced: it adds only missing fields and never rotates credentials already in use.
   Runtime provisioning validates the required Chat and Notification identities before building
   images, then forces External Secrets to synchronize the current AWS version before Kafka starts.

6. Run **AWS staging infrastructure -> provision-runtime**. It builds all six application images,
   pushes immutable tags to ECR, applies the platform, creates CloudFront and smoke-tests the HTTPS
   URL. Set `AWS_STAGING_ENABLED=true` only after this passes.

   The workflow validates the edge Terraform and resolves the required AWS-managed CloudFront
   policies before building images. If runtime deployment and the private ALB already succeeded but
   only CloudFront failed, run **apply-edge** after correcting the edge configuration. This resumes
   the edge stack and smoke test without rebuilding images or redeploying Kubernetes workloads.

   Runtime provisioning pins the External Secrets chart and retries its download before invoking
   Helm. This isolates transient GitHub Releases/network timeouts from the Kubernetes installation;
   exhausting all download attempts still fails provisioning before any application rollout. The
   deployment then restarts the External Secrets controller so a newly added IRSA service-account
   annotation is injected into its pod even when Helm did not otherwise change the pod template.

   The database bootstrap temporarily grants the RDS master user membership in each application
   role while assigning database ownership, then revokes it. RDS master users are not PostgreSQL
   superusers and cannot assign ownership to an unrelated role without that temporary membership.
   Failed bootstrap and Kafka initializer jobs are detected immediately and print pod/job logs.

## Deployment and rollback

On successful main-branch CI, `.github/workflows/cloud-deploy.yml` determines affected images,
pushes immutable ECR tags, preserves current images for unchanged services, applies the overlay and
waits for rollouts. It smoke-tests through the CloudFront hostname. If rollout or smoke testing
fails, it restores the previous application images and exits failed. Staging deployments are
serialized, so two releases cannot race.

Cloud deployment does not replace the existing Docker Hub publishing workflow. Database migration
compatibility remains each service owner's responsibility: an image rollback cannot undo a Flyway
migration. Test forward/backward compatibility before merging a migration.

Useful commands after deployment:

```bash
aws eks update-kubeconfig --name foc-staging --region ap-southeast-1
kubectl -n foc-staging get pods,deployments,hpa,ingress
kubectl -n foc-staging rollout status deployment/gateway --timeout=15m
PUBLIC_URL=$(aws ssm get-parameter --name /foc/staging/public-url --query Parameter.Value --output text)
PUBLIC_URL="$PUBLIC_URL" deploy/aws/scripts/smoke-test.sh
```

## Logs, alarms and scaling evidence

EKS control-plane logs and Container Insights application/container logs are sent to CloudWatch
with short retention. The `foc-staging` dashboard includes pod count, ALB errors/latency, RDS
capacity and Kafka health signals. Alarms cover RDS storage/CPU, CloudFront 5xx and core runtime
availability. Use CloudWatch Logs Insights for cross-pod searches; use `kubectl logs` for immediate
diagnosis:

```bash
kubectl -n foc-staging logs deployment/order-service --since=15m
kubectl -n foc-staging logs statefulset/kafka --since=15m
kubectl -n foc-staging get events --sort-by=.lastTimestamp | tail -100
```

Gateway and all five applications use HPA `1-3` at 70% CPU. To collect N2H evidence, run the load
helper in one terminal and watch both pod and node scaling in others:

```bash
PUBLIC_URL=$(aws ssm get-parameter --name /foc/staging/public-url --query Parameter.Value --output text)
PUBLIC_URL="$PUBLIC_URL" deploy/aws/scripts/load-test.sh
kubectl -n foc-staging get hpa,pods -w
kubectl get nodes -w
```

Capture CloudWatch CPU/pod graphs before, during and after load. HPA changes pod replicas; EKS Auto
Mode separately adds capacity if pending pods do not fit. Scaling is eventual and may take minutes.

## Guarded teardown and recreation

Routine teardown preserves the bootstrap bucket and OIDC roles but removes chargeable staging
resources. Run **AWS staging infrastructure -> destroy-staging** and type exactly
`DESTROY foc-staging`. The workflow destroys CloudFront first, deletes the Ingress/namespace and
waits for ALB/PVC cleanup, then destroys core Terraform resources. RDS final snapshots, Kafka EBS
volumes and ECR images are intentionally disposable.

Verify cleanup in the AWS console and CLI, especially CloudFront distributions, load balancers,
EBS volumes, NAT Gateways, EKS clusters and RDS instances. The budget may lag and is not proof that
resources are gone. To recreate, run `apply-core`, `configure-secrets.sh` if secret versions were
deleted, then `provision-runtime`; Flyway migrations and Kafka initialization rebuild the runtime.

Permanent project retirement is separate: after all stack state is removed, delete the OIDC roles
and provider, empty all versions/delete markers in the state bucket, and delete the bucket. Do not
destroy bootstrap while staging or edge state still depends on it.

## Code-only verification

These checks do not contact AWS or create billable resources:

```bash
terraform fmt -check -recursive deploy/aws/terraform
for stack in bootstrap staging-core staging-edge; do
  terraform -chdir="deploy/aws/terraform/$stack" init -backend=false
  terraform -chdir="deploy/aws/terraform/$stack" validate
done
kubectl kustomize --load-restrictor=LoadRestrictionsNone deploy/aws/k8s/staging >/tmp/foc-aws.yaml
docker compose config --quiet
python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
```

CI additionally runs ShellCheck, Kubeconform and workflow linting. A successful static check proves
syntax and internal consistency, not OIDC trust, AWS quotas, service health or teardown.

## Known staging decisions requiring production review

- The USD 25 budget, one-NAT design and single RDS/Kafka instances favor a short-lived demo.
- RDS deletion protection and final snapshots are disabled because staging data is disposable.
- Kafka replication factor one persists on encrypted EBS but does not survive broker/AZ failure.
- The EKS API remains public for GitHub-hosted runners; a production platform should use private
  runners/network access and make it private-only.
- Replace local Kafka `SASL_PLAINTEXT` with encrypted transport and rotate all credentials.
- Select production backup, multi-AZ, replication, disaster-recovery, log retention and alert
  notification policies before treating this design as production-ready.

