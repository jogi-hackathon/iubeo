variable "aws_region" {
  description = "AWS region for the game backend."
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Short project identifier used in AWS resource names."
  type        = string
  default     = "iubeo"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,19}$", var.project_name))
    error_message = "project_name must be 2-20 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prototype"
}

variable "allowed_origins" {
  description = "Exact browser origins allowed to connect to the API and WebSocket endpoint. The server refuses to start without at least one."
  type        = list(string)

  validation {
    condition     = length(var.allowed_origins) > 0 && alltrue([for origin in var.allowed_origins : can(regex("^https://[^/]+$", origin))])
    error_message = "Set at least one HTTPS origin, without a trailing slash or path."
  }
}

variable "signing_key_secret_arn" {
  description = "ARN of a Secrets Manager secret containing the IUBEO_SIGNING_KEY value (32+ bytes)."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in this region for the backend API and WebSocket hostname."
  type        = string
}

variable "image_tag" {
  description = "Immutable image tag to deploy. Set to a Git SHA in release automation."
  type        = string
  default     = "bootstrap"
}

variable "desired_count" {
  description = "Number of backend tasks. Use 1 only for prototype; shared session state is required before scaling above one."
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 1 && floor(var.desired_count) == var.desired_count
    error_message = "desired_count must be a positive integer."
  }
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture. ARM64 (Graviton) costs about 20% less per vCPU-hour and per GB-hour than X86_64. The image platform must match."
  type        = string
  default     = "ARM64"

  validation {
    condition     = contains(["ARM64", "X86_64"], var.cpu_architecture)
    error_message = "cpu_architecture must be ARM64 or X86_64."
  }
}

variable "tags" {
  description = "Tags applied to AWS resources."
  type        = map(string)
  default = {
    Application = "iubeo"
    ManagedBy   = "terraform"
  }
}
