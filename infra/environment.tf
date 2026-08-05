resource "azurerm_container_app_environment" "main" {
  name                = "${var.name_prefix}-env"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location

  log_analytics_workspace_id     = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id       = azurerm_subnet.container_apps.id
  internal_load_balancer_enabled = false

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}
