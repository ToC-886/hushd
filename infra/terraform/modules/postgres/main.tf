terraform {
  required_version = ">= 1.6.0"
}

variable "name_prefix" {
  type = string
}

variable "instance_class" {
  type    = string
  default = "db.t4g.medium"
}

output "connection_placeholder" {
  description = "Wire to actual RDS/CloudSQL output when implemented"
  value       = "postgresql://user:pass@${var.name_prefix}.db.local:5432/hushd"
}
