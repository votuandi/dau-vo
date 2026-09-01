import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  MatchStatus,
  RefereeSlot,
  TournamentStatus,
} from '@martial-arts-scoring/shared-types';

/**
 * A compile-time and runtime boundary check for the workspace shared package.
 * Feature modules can import the enums directly as they are introduced.
 */
export const SHARED_ENUM_VALUES = {
  athleteColors: [AthleteColor.RED, AthleteColor.BLUE],
  matchAccessRoles: [
    MatchAccessRole.REFEREE_1,
    MatchAccessRole.REFEREE_2,
    MatchAccessRole.REFEREE_3,
    MatchAccessRole.INSPECTOR,
  ],
  matchRoles: [MatchRole.REFEREE, MatchRole.INSPECTOR],
  matchStatuses: [
    MatchStatus.WAITING,
    MatchStatus.ROUND_1_RUNNING,
    MatchStatus.BREAK,
    MatchStatus.ROUND_2_RUNNING,
    MatchStatus.FINISHED,
  ],
  refereeSlots: [
    RefereeSlot.REFEREE_1,
    RefereeSlot.REFEREE_2,
    RefereeSlot.REFEREE_3,
  ],
  tournamentStatuses: [
    TournamentStatus.DRAFT,
    TournamentStatus.ACTIVE,
    TournamentStatus.FINISHED,
    TournamentStatus.ARCHIVED,
  ],
} as const;
