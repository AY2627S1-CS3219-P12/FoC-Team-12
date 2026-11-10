variable "aws_region" {
  type        = string
  description = "AWS region for staging."
  default     = "ap-southeast-1"
}

variable "environment" {
  type        = string
  description = "Environment name."
  default     = "staging"
}

variable "eks_version" {
  type        = string
  description = "Pinned EKS control-plane version; update deliberately after compatibility review."
  default     = "1.35"
}

variable "github_deploy_role_arn" {
  type        = string
  description = "OIDC deployment role from the bootstrap stack."
}

variable "budget_email" {
  type        = string
  description = "Email address that receives AWS budget alerts."

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.budget_email))
    error_message = "budget_email must be a valid email address."
  }
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly staging cost alert threshold."
  default     = 25
}

variable "rds_instance_class" {
  type        = string
  description = "Cost-conscious RDS class for coursework staging."
  default     = "db.t4g.micro"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR reserved for the staging VPC."
  default     = "10.42.0.0/16"
}

variable "msk_kafka_version" {
  type        = string
  description = "Pinned Amazon MSK Kafka version. Update only after client and MSK compatibility review."
  default     = "4.2.x.kraft"
}

variable "msk_broker_instance_type" {
  type        = string
  description = "Provisioned MSK broker size; three brokers are created across three AZs."
  # T3 brokers cannot run MSK's KRaft metadata mode. M7g is the smallest production-oriented
  # Graviton family supported by the pinned KRaft release.
  default = "kafka.m7g.large"
}

variable "msk_broker_storage_gib" {
  type        = number
  description = "Encrypted EBS storage allocated to each MSK broker."
  default     = 20

  validation {
    condition     = var.msk_broker_storage_gib >= 1
    error_message = "msk_broker_storage_gib must be at least 1 GiB."
  }
}
