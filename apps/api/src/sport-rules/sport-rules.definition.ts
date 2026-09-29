import { AthleteColor, MatchAccessRole } from '@prisma/client';

export interface SportRulesDefinition {
  readonly code: string;
  readonly athleteColors: readonly AthleteColor[];
  readonly accessRoles: readonly MatchAccessRole[];
  readonly minimumScoreboardConnections: number;
  readonly roundCount: number;
  /** Staffing policy used for brackets and manually prepared matches. */
  readonly defaultRequiredJudgeCount: number;
  readonly minimumRequiredRefereeCount: number;
  readonly requiresOddRefereeCount: boolean;
  readonly judgeMajority: (judgeCount: number) => number;
  readonly judgePointValue: number;
  readonly supervisorPenaltyValue: number;
  /** Decides a completed match from the server-calculated effective totals. */
  readonly determineWinner: (
    totals: Readonly<Record<AthleteColor, number>>,
  ) => AthleteColor | null;
}

/** The executable rules for SportGroup.code ONE_ON_ONE_COMBAT. */
export const oneOnOneCombatRules: SportRulesDefinition = Object.freeze({
  accessRoles: Object.freeze([
    MatchAccessRole.JUDGE_1,
    MatchAccessRole.JUDGE_2,
    MatchAccessRole.JUDGE_3,
    MatchAccessRole.SUPERVISOR,
  ]),
  athleteColors: Object.freeze([AthleteColor.RED, AthleteColor.BLUE]),
  code: 'ONE_ON_ONE_COMBAT',
  supervisorPenaltyValue: -1,
  determineWinner: (totals: Readonly<Record<AthleteColor, number>>) =>
    totals[AthleteColor.RED] === totals[AthleteColor.BLUE]
      ? null
      : totals[AthleteColor.RED] > totals[AthleteColor.BLUE]
        ? AthleteColor.RED
        : AthleteColor.BLUE,
  minimumScoreboardConnections: 1,
  defaultRequiredJudgeCount: 3,
  minimumRequiredRefereeCount: 3,
  requiresOddRefereeCount: true,
  judgeMajority: (judgeCount: number) => Math.floor(judgeCount / 2) + 1,
  judgePointValue: 1,
  roundCount: 2,
});
