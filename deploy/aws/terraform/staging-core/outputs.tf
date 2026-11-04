output "cluster_name" { value = aws_eks_cluster.main.name }
output "aws_region" { value = var.aws_region }
output "vpc_id" { value = aws_vpc.main.id }
output "private_application_subnet_ids" { value = values(aws_subnet.application)[*].id }
output "gateway_alb_security_group_id" { value = aws_security_group.gateway_alb.id }
output "rds_endpoint" { value = aws_db_instance.postgres.address }
output "rds_master_secret_arn" { value = aws_db_instance.postgres.master_user_secret[0].secret_arn }
output "external_secrets_role_arn" { value = aws_iam_role.external_secrets.arn }
output "ecr_repository_urls" { value = { for key, repo in aws_ecr_repository.service : key => repo.repository_url } }
output "runtime_secret_arns" { value = { for key, secret in aws_secretsmanager_secret.runtime : key => secret.arn } }
