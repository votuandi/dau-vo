CREATE TABLE "media_deletions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storage_key" VARCHAR(1024) NOT NULL,
  "reason" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_tried_at" TIMESTAMPTZ(3),
  CONSTRAINT "media_deletions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_deletions_storage_key_key" ON "media_deletions"("storage_key");
CREATE INDEX "media_deletions_created_at_idx" ON "media_deletions"("created_at");
