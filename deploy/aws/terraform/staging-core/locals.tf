data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "foc-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)

  services = {
    gateway  = "gateway-service"
    user     = "user-service"
    supplier = "supplier-service"
    order    = "order-service"
    credit   = "credit-service"
    admin    = "admin-service"
  }

  secret_names = toset([
    "user-service-secrets",
    "user-mail-secrets",
    "supplier-service-secrets",
    "order-service-secrets",
    "credit-service-secrets",
    "admin-service-secrets",
    "kafka-broker-secrets",
    "kafka-ui-secrets"
  ])

  tags = {
    Project     = "friend-on-campus"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "shared-team-infrastructure"
  }
}
