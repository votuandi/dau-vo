-- Preserve legacy administrator IDs, password hashes, timestamps, and audit attribution.
ALTER TABLE "admin_users" RENAME TO "users";
ALTER TABLE "users" RENAME CONSTRAINT "admin_users_pkey" TO "users_pkey";
ALTER TABLE "users" DROP CONSTRAINT "admin_users_username_key";

CREATE TYPE "user_role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

ALTER TABLE "users"
  ADD COLUMN "full_name" VARCHAR(255),
  ADD COLUMN "normalized_username" VARCHAR(100),
  ADD COLUMN "email" VARCHAR(320),
  ADD COLUMN "normalized_email" VARCHAR(320),
  ADD COLUMN "phone" VARCHAR(50),
  ADD COLUMN "normalized_phone" VARCHAR(50),
  ADD COLUMN "organization" VARCHAR(255),
  ADD COLUMN "role" "user_role" NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

UPDATE "users" SET "normalized_username" = lower(btrim("username"));
ALTER TABLE "users" ALTER COLUMN "normalized_username" SET NOT NULL;

CREATE UNIQUE INDEX "users_normalized_username_key" ON "users"("normalized_username");
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");
CREATE UNIQUE INDEX "users_normalized_phone_key" ON "users"("normalized_phone");

ALTER TABLE "audit_logs" RENAME COLUMN "admin_user_id" TO "user_id";
ALTER TABLE "audit_logs" RENAME CONSTRAINT "audit_logs_admin_user_id_fkey" TO "audit_logs_user_id_fkey";
ALTER INDEX "audit_logs_admin_user_id_idx" RENAME TO "audit_logs_user_id_idx";
