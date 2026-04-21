terraform {
  required_version = ">= 1.6.0"
}

variable "name_prefix" {
  type = string
}

output "redis_url_placeholder" {
  value = "redis://${var.name_prefix}.redis.local:6379"
}
