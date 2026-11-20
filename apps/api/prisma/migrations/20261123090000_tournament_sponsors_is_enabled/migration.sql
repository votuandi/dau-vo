-- "Ngừng tài trợ" (is_disabled) becomes "Đang tài trợ" (is_enabled); existing values are inverted.
ALTER TABLE "tournament_sponsors" RENAME COLUMN "is_disabled" TO "is_enabled";
UPDATE "tournament_sponsors" SET "is_enabled" = NOT "is_enabled";
ALTER TABLE "tournament_sponsors" ALTER COLUMN "is_enabled" SET DEFAULT true;
