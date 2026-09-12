-- Forward-only terminology migration.  PostgreSQL renames preserve row IDs,
-- timestamps, assignments, image paths, constraints, and indexes in place.
ALTER TABLE "tournament_units" RENAME TO "tournament_organizations";
ALTER TABLE "tournament_athletes" RENAME COLUMN "unit_id" TO "organization_id";

ALTER TABLE "tournament_organizations" RENAME CONSTRAINT "tournament_units_pkey" TO "tournament_organizations_pkey";
ALTER TABLE "tournament_organizations" RENAME CONSTRAINT "tournament_units_tournament_id_fkey" TO "tournament_organizations_tournament_id_fkey";
ALTER TABLE "tournament_organizations" RENAME CONSTRAINT "tournament_units_tournament_id_id_key" TO "tournament_organizations_tournament_id_id_key";
ALTER TABLE "tournament_organizations" RENAME CONSTRAINT "tournament_units_tournament_id_normalized_name_key" TO "tournament_organizations_tournament_id_normalized_name_key";
ALTER TABLE "tournament_athletes" RENAME CONSTRAINT "tournament_athletes_unit_id_fkey" TO "tournament_athletes_organization_id_fkey";
ALTER INDEX "tournament_units_tournament_id_is_active_normalized_name_idx" RENAME TO "tournament_organizations_active_name_idx";
ALTER INDEX "tournament_athletes_tournament_id_unit_id_is_active_idx" RENAME TO "tournament_athletes_tournament_id_organization_id_is_active_idx";
