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
