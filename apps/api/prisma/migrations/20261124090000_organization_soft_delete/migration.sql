-- Participating organizations can be soft-deleted. A deleted organization frees its
-- name + locality, so the uniqueness only covers rows that are not deleted.
ALTER TABLE "tournament_organizations" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "tournament_organizations" DROP CONSTRAINT "tournament_organizations_name_location_key";
CREATE UNIQUE INDEX "tournament_organizations_name_location_key" ON "tournament_organizations"("tournament_id", "normalized_name", "normalized_location") WHERE "deleted_at" IS NULL;
