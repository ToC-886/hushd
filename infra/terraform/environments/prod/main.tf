terraform {
  required_version = ">= 1.6.0"
}

module "network" {
  source      = "../../modules/network"
  name_prefix = "hushd-prod"
}

module "postgres" {
  source      = "../../modules/postgres"
  name_prefix = module.network.name_prefix
  instance_class = "db.r6g.large"
}

module "redis" {
  source      = "../../modules/redis"
  name_prefix = module.network.name_prefix
}

module "object_storage" {
  source      = "../../modules/object_storage"
  name_prefix = module.network.name_prefix
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = module.network.name_prefix
}

module "observability" {
  source      = "../../modules/observability"
  name_prefix = module.network.name_prefix
}

output "prod_connection_strings" {
  value = {
    database_url = module.postgres.connection_placeholder
    redis_url    = module.redis.redis_url_placeholder
    staging      = module.object_storage.staging_bucket_placeholder
    public       = module.object_storage.public_bucket_placeholder
  }
}
