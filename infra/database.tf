resource "azurerm_postgresql_flexible_server" "main" {
  name                = "${var.name_prefix}-pg"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location

  version           = "16"
  sku_name          = "B_Standard_B1ms"
  storage_mb        = 32768
  auto_grow_enabled = false

  administrator_login    = "agentscan"
  administrator_password = var.postgres_admin_password

  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = false

  public_network_access_enabled = false
  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]

  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = "agentscan"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

locals {
  database_url = format(
    "postgres://%s:%s@%s:5432/%s?sslmode=require",
    azurerm_postgresql_flexible_server.main.administrator_login,
    urlencode(var.postgres_admin_password),
    azurerm_postgresql_flexible_server.main.fqdn,
    azurerm_postgresql_flexible_server_database.main.name,
  )
}
