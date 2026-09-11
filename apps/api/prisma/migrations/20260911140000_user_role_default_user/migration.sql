-- Existing rows retain their roles; only future inserts receive least privilege.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
