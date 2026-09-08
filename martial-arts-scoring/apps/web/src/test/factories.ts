import { vi } from 'vitest';
import {
  AthleteColor,
  MatchRole,
  MatchStatus,
  RefereeSlot,
  type MatchStatePayload,
  type VoteAcceptedPayload,
} from '@martial-arts-scoring/shared-types';
import type { MatchRealtimeState } from '@/features/match-access/match-realtime';
import type { MatchAccessSession } from '@/services/api/match-access';

export const refereeSession: MatchAccessSession = {
  deviceId: 'f3b90c56-b6a9-43c7-9eb0-7cbcd251acb7',
  expiresAt: '2030-01-01T00:00:00.000Z',
  matchPublicId: 'A72K9P',
  refereeSlot: RefereeSlot.REFEREE_1,
  role: MatchRole.REFEREE,
  sessionId: 'session-referee-1',
};

export const inspectorSession: MatchAccessSession = {
  deviceId: 'b2afd440-9705-48cc-a95f-4c17efaf0a2c',
  expiresAt: '2030-01-01T00:00:00.000Z',
  matchPublicId: 'A72K9P',
  refereeSlot: null,
  role: MatchRole.INSPECTOR,
  sessionId: 'session-inspector',
};

export const acceptedRedVote: VoteAcceptedPayload = {
  athlete: AthleteColor.RED,
  matchPublicId: refereeSession.matchPublicId,
  refereeSlot: RefereeSlot.REFEREE_1,
  scoringWindowId: 'window-1',
  serverReceivedAt: '2026-09-01T12:00:00.250Z',
};

export function createMatchSnapshot(overrides: Partial<MatchStatePayload> = {}): MatchStatePayload {
  return {
    activeRound: {
      endedAt: null,
      endsAt: '2026-09-01T12:02:00.000Z',
      id: 'round-1',
      roundNumber: 1,
      startedAt: '2026-09-01T12:00:00.000Z',
    },
    activeScoringWindow: null,
    athletes: [
      {
        color: AthleteColor.RED,
        id: 'athlete-red',
        name: 'Nguyễn Văn Đỏ',
        organization: 'CLB Đỏ',
        score: 0,
        violations: 0,
      },
      {
        color: AthleteColor.BLUE,
        id: 'athlete-blue',
        name: 'Trần Văn Xanh',
        organization: 'CLB Xanh',
        score: 0,
        violations: 0,
      },
    ],
    generatedAt: '2026-09-01T12:00:00.000Z',
    match: {
      currentRound: 1,
      finishedAt: null,
      id: 'match-1',
      publicId: refereeSession.matchPublicId,
      startedAt: '2026-09-01T12:00:00.000Z',
      status: MatchStatus.ROUND_1_RUNNING,
    },
    presence: [],
    ...overrides,
  };
}

export function createRealtimeState(
  overrides: Partial<MatchRealtimeState> = {},
): MatchRealtimeState {
  return {
    connect: vi.fn(),
    connectionStatus: 'connected',
    disconnect: vi.fn(),
    errorMessage: null,
    lastAcceptedVote: null,
    penaltyErrorMessage: null,
    presence: [],
    reconnect: vi.fn(),
    requestSnapshot: vi.fn(),
    roundStartErrorMessage: null,
    scoringWindowMessage: null,
    snapshot: createMatchSnapshot(),
    startRound: vi.fn(() => Promise.resolve()),
    startingRound: false,
    submitPenalty: vi.fn(() => Promise.resolve()),
    submitVote: vi.fn(() => Promise.resolve()),
    submittingPenalty: null,
    submittingVote: null,
    voteSubmitErrorMessage: null,
    ...overrides,
  };
}
