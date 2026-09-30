import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  MatchStatus,
  JudgeSlot,
  TournamentStatus,
} from '@martial-arts-scoring/shared-types';

/**
 * A compile-time and runtime boundary check for the workspace shared package.
 * Feature modules can import the enums directly as they are introduced.
 */
export const SHARED_ENUM_VALUES = {
  athleteColors: [AthleteColor.RED, AthleteColor.BLUE],
  matchAccessRoles: [
    MatchAccessRole.JUDGE_1,
    MatchAccessRole.JUDGE_2,
    MatchAccessRole.JUDGE_3,
    MatchAccessRole.SUPERVISOR,
  ],
  matchRoles: [MatchRole.JUDGE, MatchRole.SUPERVISOR],
  matchStatuses: [
    MatchStatus.WAITING,
    MatchStatus.ROUND_1_RUNNING,
    MatchStatus.BREAK,
    MatchStatus.ROUND_2_RUNNING,
    MatchStatus.FINISHED,
  ],
  refereeSlots: [JudgeSlot.JUDGE_1, JudgeSlot.JUDGE_2, JudgeSlot.JUDGE_3],
  tournamentStatuses: [
    TournamentStatus.DRAFT,
    TournamentStatus.ACTIVE,
    TournamentStatus.FINISHED,
    TournamentStatus.ARCHIVED,
  ],
} as const;
