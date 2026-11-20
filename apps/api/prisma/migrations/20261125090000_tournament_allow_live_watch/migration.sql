-- "Cho phép theo dõi trực tiếp": spectators may follow the tournament on /watch. Existing tournaments stay open.
ALTER TABLE "tournaments" ADD COLUMN "allow_live_watch" BOOLEAN NOT NULL DEFAULT true;
