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

variable "image_tag" {
  description = "Immutable image tag to deploy. Set to a Git SHA in release automation."
  type        = string
  default     = "bootstrap"
}

variable "instance_type" {
  description = "EC2 instance type. t4g.small is burstable, run in unlimited mode so credits never throttle latency."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = can(regex("^[a-z][0-9][a-z]?\\.", var.instance_type))
    error_message = "instance_type must look like a valid EC2 instance type (for example t4g.small)."
  }
}

variable "root_volume_gb" {
  description = "Root EBS volume size in GiB. This keeps being billed while the instance is stopped."
  type        = number
  default     = 8
}

variable "container_memory_mib" {
  description = "Memory limit for the container in MiB. Keep it below the instance memory."
  type        = number
  default     = 1024
}

variable "tags" {
  description = "Tags applied to AWS resources."
  type        = map(string)
  default = {
    Application = "iubeo"
    ManagedBy   = "terraform"
  }
}
