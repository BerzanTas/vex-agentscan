resource "azapi_resource" "routing" {
  type      = "Microsoft.App/managedEnvironments/httpRouteConfigs@2024-10-02-preview"
  name      = "${var.name_prefix}routes"
  parent_id = azurerm_container_app_environment.main.id

  body = {
    properties = {
      customDomains = [
        {
          name        = var.public_hostname
          bindingType = "Auto"
        }
      ]

      rules = [
        {
          description = "ingest and public read api"
          routes = [
            { match = { prefix = "/v1" } },
            { match = { prefix = "/api" } },
            { match = { prefix = "/healthz" } },
          ]
          targets = [{ containerApp = azurerm_container_app.api.name }]
        },
        {
          description = "website"
          routes      = [{ match = { prefix = "/" } }]
          targets     = [{ containerApp = azurerm_container_app.web.name }]
        },
      ]
    }
  }

  response_export_values = ["properties.fqdn"]
}
