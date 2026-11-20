-- Last "Công bố Kết quả giải đấu" of a weight class podium to the scoreboards.
ALTER TABLE "tournament_brackets" ADD COLUMN "results_announced_at" TIMESTAMPTZ(3);
