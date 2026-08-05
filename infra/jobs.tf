resource "azurerm_container_app_job" "migrate" {
  name                         = "${var.name_prefix}-migrate"
  resource_group_name          = data.azurerm_resource_group.main.name
  location                     = var.location
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"

  replica_timeout_in_seconds = 600
  replica_retry_limit        = 1

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  template {
    container {
      name   = "migrate"
      image  = "ghcr.io/berzantas/vex-agentscan-migrate:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"
      args   = ["--no-dump-schema", "up"]

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
    }
  }
}

resource "azurerm_container_app_job" "purge" {
  name                         = "${var.name_prefix}-purge"
  resource_group_name          = data.azurerm_resource_group.main.name
  location                     = var.location
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"

  replica_timeout_in_seconds = 300
  replica_retry_limit        = 1

  schedule_trigger_config {
    cron_expression          = "0 * * * *"
    parallelism              = 1
    replica_completion_count = 1
  }

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
    container {
      name    = "purge"
      image   = local.server_image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["node", "dist/entry-cli.js"]
      args    = ["purge", "run"]

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
        value = "1"
      }
    }
  }
}
