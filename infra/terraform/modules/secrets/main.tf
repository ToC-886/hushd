terraform {
  required_version = ">= 1.6.0"
}

variable "name_prefix" {
  type = string
}

# NOTE: bind KMS keys + secrets manager entries for JWT, processor webhooks, IDV, and storage keys.

output "secrets_namespace" {
  value = var.name_prefix
}
