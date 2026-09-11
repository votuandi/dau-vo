CREATE TYPE "pricing_discount_type" AS ENUM ('DURATION', 'TOURNAMENT');

ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'PRICING_VERSION_CREATED';

CREATE TABLE "pricing_plan_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "base_amount_vnd" INTEGER NOT NULL,
  "base_duration_months" INTEGER NOT NULL,
  "base_tournament_limit" INTEGER NOT NULL,
  "duration_addon_unit_amount_vnd" INTEGER NOT NULL,
  "tournament_addon_unit_amount_vnd" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "activated_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_plan_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_plan_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pricing_plan_versions_amounts_positive" CHECK ("base_amount_vnd" >= 0 AND "base_duration_months" > 0 AND "base_tournament_limit" > 0 AND "duration_addon_unit_amount_vnd" >= 0 AND "tournament_addon_unit_amount_vnd" >= 0)
);
CREATE UNIQUE INDEX "pricing_plan_versions_one_active_key" ON "pricing_plan_versions" ("active") WHERE "active";
CREATE INDEX "pricing_plan_versions_active_idx" ON "pricing_plan_versions" ("active");

CREATE TABLE "pricing_discount_tiers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pricing_plan_version_id" UUID NOT NULL,
  "type" "pricing_discount_type" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "discount_basis_points" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_discount_tiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_discount_tiers_version_type_quantity_key" UNIQUE ("pricing_plan_version_id", "type", "quantity"),
  CONSTRAINT "pricing_discount_tiers_pricing_plan_version_id_fkey" FOREIGN KEY ("pricing_plan_version_id") REFERENCES "pricing_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pricing_discount_tiers_values_valid" CHECK ("quantity" > 0 AND "discount_basis_points" >= 0 AND "discount_basis_points" <= 10000)
);
