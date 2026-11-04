variable "aws_region" {
  description = "AWS region used by Friend on Campus staging."
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "staging"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.environment))
    error_message = "environment must be a short lowercase DNS-compatible name."
  }
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to assume deployment roles."
  type        = string
  default     = "AY2627S1-CS3219-P12/FoC-Team-12"
}

variable "state_bucket_name" {
  description = "Pre-created S3 bucket used for Terraform remote state."
  type        = string
}
