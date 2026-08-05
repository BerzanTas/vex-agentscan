variable "subscription_id" {
  type        = string
  description = "Subskrypcja klienta, jawna, nigdy z domyślnego kontekstu CLI"
}

variable "resource_group_name" {
  type    = string
  default = "agent-scan-dev"
}

variable "location" {
  type    = string
  default = "eastus2"
}

variable "name_prefix" {
  type    = string
  default = "agentscan"
}

variable "image_tag" {
  type        = string
  description = "Niezmienny SHA commita w GHCR; nigdy \"latest\""
}

variable "postgres_admin_password" {
  type      = string
  sensitive = true
}

variable "agent_alias_salt" {
  type      = string
  sensitive = true
}

variable "rate_limit_key_salt" {
  type      = string
  sensitive = true
}

variable "backup_retention_days" {
  type    = number
  default = 30

  validation {
    condition     = var.backup_retention_days <= 30
    error_message = "Strona /methodology deklaruje retencję kopii co najwyżej 30 dni."
  }
}

variable "log_retention_days" {
  type    = number
  default = 30

  validation {
    condition     = var.log_retention_days <= 30
    error_message = "Strona /methodology deklaruje retencję logów dostępowych co najwyżej 30 dni."
  }
}
