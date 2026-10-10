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

variable "wisp_image_tag" {
  description = "Initial value of the WISP image tag parameter. Release automation replaces it."
  type        = string
  default     = "bootstrap"
}

variable "wisp_pass" {
  description = "Password required to issue WISP tokens on the instance (IUBEO_WISP_PASS). Empty leaves WISP token issuance disabled; the WISP process still runs but refuses everything."
  type        = string
  default     = ""
  sensitive   = true
}

variable "vc_private_key" {
  description = "Voice Chat の JWT を署名する Ed25519 の種(base64url 32 バイト)。VC サービスと同じ鍵を使う。空なら VC のトークンを発行しない"
  type        = string
  default     = ""
  sensitive   = true
}

variable "vc_signaling_url" {
  description = "VC のシグナリング(WebSocket)の URL。例: wss://vc.thirdlf03.com/v1/signaling"
  type        = string
  default     = ""
}

variable "vc_media_url" {
  description = "VC の MoQ(WebTransport)の URL。例: https://media.thirdlf03.com:4443"
  type        = string
  default     = ""
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

variable "auto_stop_hours" {
  description = "Hours after /start before the instance is stopped automatically. This is the safety net that stops the $0.67/day leak."
  type        = number
  default     = 3
}

variable "discord_public_key" {
  description = "Discord application public key (hex) used to verify interaction signatures. Leave empty until the Discord app exists; the Function URL returns 401 and only direct invoke works."
  type        = string
  default     = ""
}

variable "discord_webhook_url" {
  description = "Discord channel webhook URL. The Lambda posts here when the instance actually starts or stops (driven by EC2 state-change events). Leave empty to disable notifications."
  type        = string
  default     = ""
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers KV Storage: Edit. Used to switch /api and /ws routing on start and stop. Leave empty for manual switching."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the KV namespace."
  type        = string
  default     = ""
}

variable "cloudflare_kv_namespace_id" {
  description = "KV namespace ID holding the \"target\" key that selects the backend."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to assume the deploy role through OIDC."
  type        = string
  default     = "jogi-hackathon/iubeo"
}

variable "github_repository_name" {
  description = "Repository name without the owner. Used to build the OIDC sub claim."
  type        = string
  default     = "iubeo"
}

variable "github_owner_id" {
  description = "Immutable numeric ID of the GitHub owner. GitHub includes it in the OIDC sub claim to prevent name reuse."
  type        = string
  default     = "331157460"
}

variable "github_repository_id" {
  description = "Immutable numeric ID of the GitHub repository. GitHub includes it in the OIDC sub claim to prevent name reuse."
  type        = string
  default     = "1378523961"
}
