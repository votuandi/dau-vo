import { AthleteColor, ScoreEventType } from '@prisma/client';
import { calculateMatchScoreProjection } from './match-score-projection';

describe('calculateMatchScoreProjection', () => {
  it('counts a fault without deducting the athlete score', () => {
    const projection = calculateMatchScoreProjection({
      athletes: [
        { color: AthleteColor.RED, id: 'red-athlete' },
        { color: AthleteColor.BLUE, id: 'blue-athlete' },
      ],
      faults: [
        {
          athleteId: 'red-athlete',
          invalidatedAt: null,
          roundId: 'round-1',
        },
      ],
      scoreEvents: [
        {
          athleteId: 'red-athlete',
          revertedAt: null,
          roundId: 'round-1',
          type: ScoreEventType.REFEREE_POINT,
          value: 3,
        },
      ],
      validRoundIds: ['round-1'],
    });

    expect(projection).toEqual([
      {
        athleteId: 'red-athlete',
        color: AthleteColor.RED,
        faultCount: 1,
        refereeScore: 3,
      },
      {
        athleteId: 'blue-athlete',
        color: AthleteColor.BLUE,
        faultCount: 0,
        refereeScore: 0,
      },
    ]);
  });
});
