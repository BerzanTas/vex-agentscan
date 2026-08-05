output "routing_fqdn" {
  value       = azapi_resource.routing.output.properties.fqdn
  description = "Publiczny FQDN konfiguracji tras"
}

output "postgres_fqdn" {
  value       = azurerm_postgresql_flexible_server.main.fqdn
  description = "Prywatna nazwa serwera bazy"
}
