terraform {
  required_version = ">= 1.6.0"
}

variable "name_prefix" {
  type = string
}

# NOTE: wire Sentry DSN + Datadog agent/API keys via secrets manager references.

output "service_name" {
  value = "${var.name_prefix}-api"
}
