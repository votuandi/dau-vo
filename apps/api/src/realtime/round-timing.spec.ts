import { activeRoundElapsedMs } from './round-timing';

describe('activeRoundElapsedMs', () => {
  const startedAt = new Date('2026-09-10T00:00:00.000Z');

  it('returns active time five seconds after round start', () => {
    expect(
      activeRoundElapsedMs(
        {
          durationMs: 60_000,
          endsAt: new Date('2026-09-10T00:01:00.000Z'),
        },
        new Date('2026-09-10T00:00:05.000Z'),
      ),
    ).toBe(5_000);
  });

  it('excludes paused time by using the extended deadline', () => {
    expect(
      activeRoundElapsedMs(
        {
          durationMs: 60_000,
          // Five seconds elapsed, then a twenty-second pause and resume.
          endsAt: new Date('2026-09-10T00:01:20.000Z'),
        },
        new Date('2026-09-10T00:00:25.000Z'),
      ),
    ).toBe(5_000);
  });

  it('excludes multiple pause and resume cycles', () => {
    expect(
      activeRoundElapsedMs(
        {
          durationMs: 60_000,
          // Fifteen seconds of pauses in total have extended the deadline.
          endsAt: new Date('2026-09-10T00:01:15.000Z'),
        },
        new Date('2026-09-10T00:00:25.000Z'),
      ),
    ).toBe(10_000);
  });

  it('clamps a clock-overrun result to zero', () => {
    expect(
      activeRoundElapsedMs(
        { durationMs: 60_000, endsAt: new Date('2026-09-10T00:01:00.000Z') },
        new Date('2026-09-09T23:59:59.999Z'),
      ),
    ).toBe(0);
  });

  it('returns null when a legacy record has no duration snapshot', () => {
    expect(
      activeRoundElapsedMs(
        { durationMs: null, endsAt: new Date('2026-09-10T00:01:00.000Z') },
        startedAt,
      ),
    ).toBeNull();
  });
});
