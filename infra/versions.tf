terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "agent-scan-dev"
    storage_account_name = "agentscantfstate01"
    container_name       = "tfstate"
    key                  = "agentscan.tfstate"
  }
}
