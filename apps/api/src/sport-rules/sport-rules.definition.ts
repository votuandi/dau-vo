import { AthleteColor, MatchAccessRole, RefereeSlot } from '@prisma/client';

export interface SportRulesDefinition {
  readonly code: string;
  readonly athleteColors: readonly AthleteColor[];
  readonly accessRoles: readonly MatchAccessRole[];
  readonly requiredRefereeSlots: readonly RefereeSlot[];
  readonly minimumScoreboardConnections: number;
  readonly roundCount: number;
  readonly refereeMajorityThreshold: number;
  readonly refereePointValue: number;
  readonly inspectorPenaltyValue: number;
  /** Decides a completed match from the server-calculated effective totals. */
  readonly determineWinner: (
    totals: Readonly<Record<AthleteColor, number>>,
  ) => AthleteColor | null;
}

/** The executable rules for SportGroup.code ONE_ON_ONE_COMBAT. */
export const oneOnOneCombatRules: SportRulesDefinition = Object.freeze({
  accessRoles: Object.freeze([
    MatchAccessRole.REFEREE_1,
    MatchAccessRole.REFEREE_2,
    MatchAccessRole.REFEREE_3,
    MatchAccessRole.INSPECTOR,
  ]),
  athleteColors: Object.freeze([AthleteColor.RED, AthleteColor.BLUE]),
  code: 'ONE_ON_ONE_COMBAT',
  inspectorPenaltyValue: -1,
  determineWinner: (totals: Readonly<Record<AthleteColor, number>>) =>
    totals[AthleteColor.RED] === totals[AthleteColor.BLUE]
      ? null
      : totals[AthleteColor.RED] > totals[AthleteColor.BLUE]
        ? AthleteColor.RED
        : AthleteColor.BLUE,
  minimumScoreboardConnections: 1,
  refereeMajorityThreshold: 2,
  refereePointValue: 1,
  requiredRefereeSlots: Object.freeze([
    RefereeSlot.REFEREE_1,
    RefereeSlot.REFEREE_2,
    RefereeSlot.REFEREE_3,
  ]),
  roundCount: 2,
});
