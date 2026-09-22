import { ScoreEventType } from '@prisma/client';

export interface ResultAdjustment {
  bonusPoints: number;
  penaltyPoints: number;
}

export function finalScore(base: number, adjustment: ResultAdjustment): number {
  return base + adjustment.bonusPoints - adjustment.penaltyPoints;
}

/** Valid V2 referee points for exactly the supplied rounds. */
export function refereeBaseForRounds(input: {
  athleteId: string;
  roundIds: readonly string[];
  events: readonly {
    athleteId: string;
    revertedAt: Date | null;
    roundId: string | null;
    type: ScoreEventType;
    value: number;
  }[];
}): number {
  const ids = new Set(input.roundIds);
  return input.events.reduce(
    (total, event) =>
      event.athleteId === input.athleteId &&
      event.type === ScoreEventType.REFEREE_POINT &&
      event.revertedAt === null &&
      event.roundId !== null &&
      ids.has(event.roundId)
        ? total + event.value
        : total,
    0,
  );
}

export const regulationBase = refereeBaseForRounds;
export const overtimeBase = refereeBaseForRounds;
