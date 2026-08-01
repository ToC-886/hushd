-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "GeoBlockScope" AS ENUM ('ACCESS', 'PAYOUTS');

-- DropIndex
DROP INDEX "geo_blocks_country_code_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN     "country_code" TEXT;

-- AlterTable
ALTER TABLE "geo_blocks" ADD COLUMN     "scope" "GeoBlockScope" NOT NULL DEFAULT 'ACCESS';

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "email_tokens_token_hash_idx" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "geo_blocks_scope_active_idx" ON "geo_blocks"("scope", "active");

-- CreateIndex
CREATE UNIQUE INDEX "geo_blocks_country_code_scope_key" ON "geo_blocks"("country_code", "scope");

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
