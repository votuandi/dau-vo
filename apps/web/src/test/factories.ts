import { vi } from 'vitest';
import {
  AthleteColor,
  MatchAccessRole,
  MatchLifecycle,
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
  identity: { kind: 'legacy', refereeSlot: RefereeSlot.REFEREE_1 },
  matchPublicId: refereeSession.matchPublicId,
  scoringWindowId: 'window-1',
  serverReceivedAt: '2026-09-01T12:00:00.250Z',
};

export function createMatchSnapshot(overrides: Partial<MatchStatePayload> = {}): MatchStatePayload {
  return {
    activeRound: {
      attemptNumber: 0,
      endedAt: null,
      endsAt: '2026-09-01T12:02:00.000Z',
      id: 'round-1',
      pausedAt: null,
      remainingDurationMs: null,
      roundNumber: 1,
      stage: 'REGULATION',
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
    completion: { canComplete: false, blockedReasons: ['ROUND_1_NOT_ENDED', 'ROUND_2_NOT_ENDED'] },
    result: {
      canCompleteAppeal: false,
      canStartOvertime: false,
      canRestartOvertime: false,
      canSelectManualWinner: false,
      canPublishResult: false,
      blockedReasons: ['NOT_REGULATION_APPEAL'],
      regulation: { RED: null, BLUE: null },
      overtime: { RED: null, BLUE: null },
      isTie: null,
    },
    exit: { canExit: false, allowedModes: [], blockedReasons: [] },
    generatedAt: '2026-09-01T12:00:00.000Z',
    match: {
      currentRound: 1,
      finishedAt: null,
      id: 'match-1',
      lifecycle: MatchLifecycle.IN_PROGRESS,
      phase: MatchStatus.ROUND_1_RUNNING,
      publicId: refereeSession.matchPublicId,
      rulesVersion: 'FAULT_APPEAL_OVERTIME_V2',
      startedAt: '2026-09-01T12:00:00.000Z',
      status: MatchStatus.ROUND_1_RUNNING,
    },
    presence: [
      MatchAccessRole.REFEREE_1,
      MatchAccessRole.REFEREE_2,
      MatchAccessRole.REFEREE_3,
      MatchAccessRole.INSPECTOR,
    ].map((accessRole) => ({
      accessRole,
      activeSession: true,
      connected: true,
      connectedSocketCount: 1,
    })),
    officials: [],
    readiness: {
      canStartRound: true,
      kind: 'LEGACY_MATCH_ACCESS',
      missingRequirements: [],
      requiredRefereeCount: 3,
      referees: { REFEREE_1: true, REFEREE_2: true, REFEREE_3: true },
      scoreboardConnectedCount: 1,
    },
    scoreboardConnectedCount: 1,
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
    faultErrorMessage: null,
    completeAppeal: vi.fn(() => Promise.resolve(true)),
    startOvertime: vi.fn(() => Promise.resolve(true)),
    restartOvertime: vi.fn(() => Promise.resolve(true)),
    selectManualWinner: vi.fn(() => Promise.resolve(true)),
    submittingResultAction: false,
    resultActionErrorMessage: null,
    presence: createMatchSnapshot().presence,
    pauseRound: vi.fn(() => Promise.resolve(true)),
    resumeRound: vi.fn(() => Promise.resolve(true)),
    controllingRound: false,
    roundControlErrorMessage: null,
    cancelRoundResult: vi.fn(() => Promise.resolve(true)),
    resetMatchResults: vi.fn(() => Promise.resolve(true)),
    exitMatch: vi.fn(() => Promise.resolve(true)),
    undoResultCancellation: vi.fn(() => Promise.resolve(true)),
    cancellingResults: false,
    completeMatch: vi.fn(() => Promise.resolve(true)),
    completingMatch: false,
    completionErrorMessage: null,
    resultCancellationErrorMessage: null,
    reconnect: vi.fn(),
    requestSnapshot: vi.fn(),
    roundStartErrorMessage: null,
    scoringWindowMessage: null,
    snapshot: createMatchSnapshot(),
    startRound: vi.fn(() => Promise.resolve()),
    startingRound: false,
    submitFault: vi.fn(() => Promise.resolve()),
    submitVote: vi.fn(() => Promise.resolve()),
    submittingFault: null,
    submittingVote: null,
    voteSubmitErrorMessage: null,
    ...overrides,
  };
}
