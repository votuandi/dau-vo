import { describe, expect, it } from 'vitest';
import {
  AthleteColor,
  MatchStatus,
  ScoringWindowStatus,
  type MatchSnapshot,
} from '@dau-vo/shared-types';
import { createInitialRealtimeState, realtimeMatchReducer } from './realtime-match-reducer';

function snapshot(serverNow: string, score = 0): MatchSnapshot {
  return {
    serverNow,
    match: {
      id: 'match-id',
      publicId: 'A72K9P',
      tournamentId: 'tournament-id',
      tournamentName: 'Giải thử nghiệm',
      status: MatchStatus.ROUND_1_RUNNING,
      currentRound: 1,
      roundDurationMs: 120_000,
      breakDurationMs: 60_000,
      breakEndsAt: null,
      startedAt: '2026-08-28T10:00:00.000Z',
      finishedAt: null,
    },
    round: {
      number: 1,
      startedAt: '2026-08-28T10:00:00.000Z',
      endsAt: '2026-08-28T10:02:00.000Z',
      endedAt: null,
    },
    red: {
      id: 'red-id',
      color: AthleteColor.RED,
      name: 'Lê Văn A',
      organization: 'Đơn vị A',
      score,
      violations: 0,
    },
    blue: {
      id: 'blue-id',
      color: AthleteColor.BLUE,
      name: 'Nguyễn Văn B',
      organization: 'Đơn vị B',
      score: 0,
      violations: 0,
    },
    activeScoringWindow: {
      id: 'window-id',
      roundNumber: 1,
      status: ScoringWindowStatus.OPEN,
      startedAt: '2026-08-28T10:00:10.000Z',
      endsAt: '2026-08-28T10:00:11.000Z',
      resolvedAt: null,
    },
    presence: { REFEREE_1: true, REFEREE_2: true, REFEREE_3: true, INSPECTOR: true },
  };
}

describe('realtime match reducer', () => {
  it('keeps the last snapshot visible when disconnected and locks commands', () => {
    const state = { ...createInitialRealtimeState(snapshot('2026-08-28T10:00:10.000Z')), connection: 'CONNECTED' as const };
    const result = realtimeMatchReducer(state, { type: 'DISCONNECTED' });
    expect(result.snapshot?.red.score).toBe(0);
    expect(result.connection).toBe('DISCONNECTED');
    expect(result.pendingCommand).toBeNull();
  });

  it('ignores an older out-of-order authoritative snapshot', () => {
    const state = createInitialRealtimeState(snapshot('2026-08-28T10:00:12.000Z', 1));
    const result = realtimeMatchReducer(state, {
      type: 'SNAPSHOT_RECEIVED',
      snapshot: snapshot('2026-08-28T10:00:11.000Z', 0),
      receivedAt: Date.parse('2026-08-28T10:00:11.100Z'),
    });
    expect(result.snapshot?.red.score).toBe(1);
  });

  it('records only server acknowledgement and releases the matching window lock', () => {
    let state = realtimeMatchReducer(createInitialRealtimeState(snapshot('2026-08-28T10:00:10.000Z')), {
      type: 'VOTE_ACCEPTED',
      payload: {
        commandId: 'command-id',
        scoringWindowId: 'window-id',
        athleteColor: AthleteColor.RED,
        serverReceivedAt: '2026-08-28T10:00:10.200Z',
        windowEndsAt: '2026-08-28T10:00:11.000Z',
      },
    });
    expect(state.acceptedVote?.athleteColor).toBe(AthleteColor.RED);
    expect(state.snapshot?.red.score).toBe(0);
    state = realtimeMatchReducer(state, {
      type: 'WINDOW_RESOLVED',
      scoringWindowId: 'window-id',
      snapshot: { ...snapshot('2026-08-28T10:00:11.001Z', 1), activeScoringWindow: null },
    });
    expect(state.acceptedVote).toBeNull();
    expect(state.snapshot?.red.score).toBe(1);
  });

  it('makes revocation terminal for local command state', () => {
    const state = realtimeMatchReducer(createInitialRealtimeState(snapshot('2026-08-28T10:00:10.000Z')), {
      type: 'SESSION_REVOKED',
      payload: { sessionId: 'session-id', reason: 'TAKEOVER' },
    });
    expect(state.connection).toBe('REVOKED');
    expect(state.pendingCommand).toBeNull();
    expect(state.revoked?.reason).toBe('TAKEOVER');
  });
});
