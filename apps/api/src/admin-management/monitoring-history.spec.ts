import {
  monitoringScoreEvent,
  monitoringScoringWindow,
} from './monitoring-history';

describe('monitoring history projection', () => {
  it('uses a scoring window occurrence and elapsed time for REFEREE_POINT', () => {
    const windowStartedAt = new Date('2026-09-10T00:00:05.000Z');
    const result = monitoringScoreEvent(
      {
        createdAt: new Date('2026-09-10T00:00:06.000Z'),
        occurredAt: new Date('2026-09-10T00:00:06.000Z'),
        roundId: 'e5ce848d-f71a-414c-9170-3b9d74edc943',
        roundElapsedMs: 6_000,
      },
      { roundElapsedMs: 5_000, startedAt: windowStartedAt },
    );

    expect(result).toMatchObject({
      occurredAt: windowStartedAt,
      roundElapsedMs: 5_000,
    });
  });

  it('keeps an event without a round at null elapsed time', () => {
    const createdAt = new Date('2026-09-10T00:00:05.000Z');
    expect(
      monitoringScoreEvent(
        { createdAt, occurredAt: null, roundId: null, roundElapsedMs: null },
        null,
      ),
    ).toMatchObject({ occurredAt: createdAt, roundElapsedMs: null });
  });

  it("uses each restarted attempt's persisted elapsed snapshot", () => {
    const firstAttempt = monitoringScoringWindow({
      roundElapsedMs: 48_000,
      startedAt: new Date('2026-09-10T00:00:48.000Z'),
    });
    const restartedAttempt = monitoringScoringWindow({
      roundElapsedMs: 5_000,
      startedAt: new Date('2026-09-10T00:10:05.000Z'),
    });

    expect(firstAttempt.roundElapsedMs).toBe(48_000);
    expect(restartedAttempt.roundElapsedMs).toBe(5_000);
  });

  it('preserves invalidated window history while adding occurredAt', () => {
    const invalidatedAt = new Date('2026-09-10T00:01:00.000Z');
    expect(
      monitoringScoringWindow({
        invalidatedAt,
        roundElapsedMs: 5_000,
        startedAt: new Date('2026-09-10T00:00:05.000Z'),
      }),
    ).toMatchObject({ invalidatedAt, roundElapsedMs: 5_000 });
  });
});
