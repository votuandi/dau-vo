-- Tournament sponsors, managed per tournament. `deleted_at` marks a soft delete.
CREATE TABLE "tournament_sponsors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tournament_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "details" TEXT,
    "image_path" VARCHAR(1024),
    "tier" INTEGER NOT NULL,
    "tier_name" VARCHAR(255) NOT NULL,
    "display_index" INTEGER NOT NULL,
    "is_disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tournament_sponsors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tournament_sponsors_tier_check" CHECK ("tier" >= 1),
    CONSTRAINT "tournament_sponsors_display_index_check" CHECK ("display_index" >= 1)
);

CREATE INDEX "tournament_sponsors_list_idx" ON "tournament_sponsors"("tournament_id", "deleted_at", "display_index");

-- Display positions are unique among the sponsors that have not been deleted.
CREATE UNIQUE INDEX "tournament_sponsors_display_index_key" ON "tournament_sponsors"("tournament_id", "display_index") WHERE "deleted_at" IS NULL;

ALTER TABLE "tournament_sponsors" ADD CONSTRAINT "tournament_sponsors_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
