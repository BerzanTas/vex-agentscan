variable "monthly_budget_usd" {
  type    = number
  default = 40
}

variable "budget_alert_emails" {
  type = list(string)
}

variable "budget_start_date" {
  type        = string
  description = "Pierwszy dzien miesiaca w formacie RFC3339, na przyklad 2026-08-01T00:00:00Z"
}

resource "azurerm_consumption_budget_resource_group" "main" {
  name              = "${var.name_prefix}-monthly"
  resource_group_id = data.azurerm_resource_group.main.id
  amount            = var.monthly_budget_usd
  time_grain        = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 50
    threshold_type = "Actual"
    operator       = "GreaterThan"
    contact_emails = var.budget_alert_emails
  }

  notification {
    enabled        = true
    threshold      = 80
    threshold_type = "Actual"
    operator       = "GreaterThan"
    contact_emails = var.budget_alert_emails
  }

  notification {
    enabled        = true
    threshold      = 100
    threshold_type = "Actual"
    operator       = "GreaterThan"
    contact_emails = var.budget_alert_emails
  }

  notification {
    enabled        = true
    threshold      = 100
    threshold_type = "Forecasted"
    operator       = "GreaterThan"
    contact_emails = var.budget_alert_emails
  }
}
