variable "log_daily_quota_gb" {
  type        = number
  default     = 0.15
  description = "Twardy dzienny limit pozyskiwania. 0.15 GB/dzien daje max ~4.5 GB/mc, czyli miesci sie w darmowym progu 5 GB."
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.name_prefix}-logs"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  daily_quota_gb      = var.log_daily_quota_gb
}
