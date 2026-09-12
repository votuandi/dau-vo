-- Registered-athlete snapshots may have no unit. Legacy text snapshots remain
-- valid, while new snapshots are populated from tournament roster records.
ALTER TABLE "match_athletes" ALTER COLUMN "organization" DROP NOT NULL;
