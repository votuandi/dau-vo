-- DropForeignKey
ALTER TABLE "admin_entitlements" DROP CONSTRAINT "admin_entitlements_user_id_fkey";

-- DropForeignKey
ALTER TABLE "bracket_winner_decision_idempotency" DROP CONSTRAINT "bracket_winner_decision_idempotency_fixture_id_fkey";

-- DropForeignKey
ALTER TABLE "match_athletes" DROP CONSTRAINT "match_athletes_match_tournament_id_fkey";

-- DropForeignKey
ALTER TABLE "subscription_orders" DROP CONSTRAINT "subscription_orders_pricing_plan_version_id_fkey";

-- DropForeignKey
ALTER TABLE "subscription_orders" DROP CONSTRAINT "subscription_orders_user_id_fkey";

-- DropIndex
DROP INDEX "admin_entitlements_admin_access_ended_at_idx";

-- DropIndex
DROP INDEX "admin_entitlements_status_active_until_idx";

-- AlterTable
ALTER TABLE "tournament_brackets" ALTER COLUMN "round_count" SET DATA TYPE INTEGER;

-- RenameForeignKey
ALTER TABLE "tournament_athletes" RENAME CONSTRAINT "tournament_athletes_organization_id_fkey" TO "tournament_athletes_tournament_id_organization_id_fkey";

-- RenameForeignKey
ALTER TABLE "tournament_athletes" RENAME CONSTRAINT "tournament_athletes_weight_class_id_fkey" TO "tournament_athletes_tournament_id_weight_class_id_fkey";

-- AddForeignKey
ALTER TABLE "admin_entitlements" ADD CONSTRAINT "admin_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_pricing_plan_version_id_fkey" FOREIGN KEY ("pricing_plan_version_id") REFERENCES "pricing_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
