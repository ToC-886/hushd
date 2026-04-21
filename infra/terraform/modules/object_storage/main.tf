terraform {
  required_version = ">= 1.6.0"
}

variable "name_prefix" {
  type = string
}

output "staging_bucket_placeholder" {
  value = "${var.name_prefix}-staging"
}

output "public_bucket_placeholder" {
  value = "${var.name_prefix}-public"
}
