import { ScoreEventType } from '@prisma/client';
import {
  finalScore,
  overtimeBase,
  regulationBase,
} from './result-calculations';

const valid = (athleteId: string, roundId: string, value: number) => ({
  athleteId,
  roundId,
  value,
  type: ScoreEventType.REFEREE_POINT,
  revertedAt: null,
});

describe('independent result calculations', () => {
  it('uses R1 and R2 only for regulation, and one overtime round only for overtime', () => {
    const events = [
      valid('red', 'r1', 2),
      valid('red', 'r2', 3),
      valid('red', 'ot-1', 9),
      valid('red', 'ot-2', 4),
      { ...valid('red', 'r1', 20), revertedAt: new Date() },
    ];
    expect(
      regulationBase({ athleteId: 'red', roundIds: ['r1', 'r2'], events }),
    ).toBe(5);
    expect(overtimeBase({ athleteId: 'red', roundIds: ['ot-2'], events })).toBe(
      4,
    );
  });

  it.each([
    [0, 0, 7],
    [3, 0, 10],
    [0, 2, 5],
    [3, 2, 8],
    [0, 9, 0],
  ] as const)(
    'applies bonus %i and penalty %i to base independently',
    (bonus, penalty, expected) => {
      expect(
        finalScore(7, { bonusPoints: bonus, penaltyPoints: penalty }),
      ).toBe(expected);
    },
  );
});
