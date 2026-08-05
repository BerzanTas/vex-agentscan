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

variable "public_hostname" {
  type        = string
  description = "Wlasna domena publiczna wskazujaca rekordem A na staticIp srodowiska"
}

variable "image_tag" {
  type        = string
  description = "Niezmienny SHA commita w GHCR; nigdy \"latest\""
}

variable "postgres_admin_password" {
  type      = string
  sensitive = true

  validation {
    condition     = !can(regex("\\s", var.postgres_admin_password))
    error_message = "Hasło nie może zawierać białych znaków: urlencode() mapuje spację na \"+\", a \"+\" w części userinfo adresu URL to znak dosłowny, nie zakodowana spacja."
  }
}

variable "agent_alias_salt" {
  type      = string
  sensitive = true
}

variable "rate_limit_key_salt" {
  type      = string
  sensitive = true
}

variable "rpc_url_overrides" {
  type        = map(string)
  default     = {}
  sensitive   = true
  description = "Klucz: canonicalSlug z rejestru sieci w packages/core. Wartość: lista URL-i RPC po przecinku, primary jako pierwszy. Puste = wyłącznie publiczne endpointy z rejestru."
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
