terraform {
  required_version = ">= 1.6.0"
}

variable "name_prefix" {
  type        = string
  description = "Prefix for resource names"
}

output "name_prefix" {
  value = var.name_prefix
}

# NOTE: Implement VPC/subnets/NAT for your chosen cloud provider here.
