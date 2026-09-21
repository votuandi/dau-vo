import { AthleteColor, ScoreEventType } from '@prisma/client';

/** Pure canonical V2 result calculation.  Faults never become score events. */
export function calculateMatchScoreProjection(input: {
  athletes: Array<{ id: string; color: AthleteColor }>;
  faults: Array<{
    athleteId: string;
    invalidatedAt: Date | null;
    roundId: string;
  }>;
  scoreEvents: Array<{
    athleteId: string;
    revertedAt: Date | null;
    roundId: string | null;
    type: ScoreEventType;
    value: number;
  }>;
  validRoundIds: readonly string[];
}) {
  const valid = new Set(input.validRoundIds);
  const scores = new Map<string, number>();
  const faults = new Map<string, number>();
  for (const athlete of input.athletes) {
    scores.set(athlete.id, 0);
    faults.set(athlete.id, 0);
  }
  for (const event of input.scoreEvents) {
    if (
      event.type === ScoreEventType.REFEREE_POINT &&
      event.revertedAt === null &&
      event.roundId !== null &&
      valid.has(event.roundId)
    )
      scores.set(
        event.athleteId,
        (scores.get(event.athleteId) ?? 0) + event.value,
      );
  }
  for (const fault of input.faults) {
    if (fault.invalidatedAt === null && valid.has(fault.roundId))
      faults.set(fault.athleteId, (faults.get(fault.athleteId) ?? 0) + 1);
  }
  return input.athletes.map((athlete) => ({
    athleteId: athlete.id,
    color: athlete.color,
    faultCount: faults.get(athlete.id) ?? 0,
    refereeScore: scores.get(athlete.id) ?? 0,
  }));
}
