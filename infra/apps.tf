locals {
  server_image = "ghcr.io/berzantas/vex-agentscan-server:${var.image_tag}"

  server_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3000" },
  ]
}

resource "azurerm_container_app" "api" {
  name                         = "api"
  resource_group_name          = data.azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  secret {
    name  = "database-url"
    value = local.database_url
  }
  secret {
    name  = "agent-alias-salt"
    value = var.agent_alias_salt
  }
  secret {
    name  = "rate-limit-key-salt"
    value = var.rate_limit_key_salt
  }

  ingress {
    external_enabled = false
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 0
    max_replicas = 3

    http_scale_rule {
      name                = "http"
      concurrent_requests = 3
    }

    container {
      name   = "api"
      image  = local.server_image
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = local.server_env
        content {
          name  = env.value.name
          value = env.value.value
        }
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "AGENT_ALIAS_SALT"
        secret_name = "agent-alias-salt"
      }
      env {
        name        = "RATE_LIMIT_KEY_SALT"
        secret_name = "rate-limit-key-salt"
      }
      env {
        name  = "TRUST_PROXY"
        value = azurerm_subnet.container_apps.address_prefixes[0]
      }
      env {
        name  = "DATABASE_POOL_MAX"
        value = "3"
      }
    }
  }

  depends_on = [azurerm_container_app_job.migrate]
}

resource "azurerm_container_app" "web" {
  name                         = "web"
  resource_group_name          = data.azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  ingress {
    external_enabled = false
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 0
    max_replicas = 10

    http_scale_rule {
      name                = "http"
      concurrent_requests = 20
    }

    container {
      name   = "web"
      image  = "ghcr.io/berzantas/vex-agentscan-web:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "API_BASE_URL"
        value = "http://api"
      }
    }
  }
}

resource "azurerm_container_app" "worker" {
  name                         = "worker"
  resource_group_name          = data.azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  secret {
    name  = "database-url"
    value = local.database_url
  }
  secret {
    name  = "agent-alias-salt"
    value = var.agent_alias_salt
  }
  secret {
    name  = "rate-limit-key-salt"
    value = var.rate_limit_key_salt
  }

  template {
    min_replicas = 0
    max_replicas = 2

    custom_scale_rule {
      name             = "verification-queue"
      custom_rule_type = "postgresql"

      metadata = {
        query            = "SELECT count(*) FROM verification_jobs WHERE next_attempt_at <= now()"
        targetQueryValue = "20"
      }

      authentication {
        secret_name       = "database-url"
        trigger_parameter = "connection"
      }
    }

    container {
      name    = "worker"
      image   = local.server_image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["node", "dist/entry-worker.js"]

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "AGENT_ALIAS_SALT"
        secret_name = "agent-alias-salt"
      }
      env {
        name        = "RATE_LIMIT_KEY_SALT"
        secret_name = "rate-limit-key-salt"
      }
      env {
        name  = "DATABASE_POOL_MAX"
        value = "3"
      }
    }
  }

  depends_on = [azurerm_container_app_job.migrate]
}
