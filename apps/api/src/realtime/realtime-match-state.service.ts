import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AthleteColor as SharedAthleteColor,
  MatchAccessRole as SharedMatchAccessRole,
  MatchLifecycle as SharedMatchLifecycle,
  MatchStatus as SharedMatchStatus,
  type MatchPresenceEntry,
  type MatchOfficialPresenceEntry,
  type MatchReadiness,
  type MatchStartReadinessDetails,
  type PublicMatchStatePayload,
  type MatchRoundState,
  type MatchScoringWindowState,
  type MatchStatePayload,
  type MatchStateViewer,
  type MatchCompletionBlockedReason,
  type MatchExitBlockedReason,
  type MatchExitCapability,
  type ResultCapability,
  MatchExitMode,
  type PresenceUpdatedPayload,
  RefereeSlot as SharedRefereeSlot,
} from '@martial-arts-scoring/shared-types';
import {
  AthleteColor,
  MatchAccessRole,
  MatchLifecycle,
  MatchStatus,
  MatchRulesVersion,
  RefereeSlot,
} from '@prisma/client';
import type { MatchOutcomeMethod, RoundStage } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { RealtimeSessionRegistryService } from './realtime-session-registry.service';
import { calculateMatchScoreProjection } from './match-score-projection';

const ACCESS_ROLES = [
  MatchAccessRole.REFEREE_1,
  MatchAccessRole.REFEREE_2,
  MatchAccessRole.REFEREE_3,
  MatchAccessRole.INSPECTOR,
] as const satisfies readonly MatchAccessRole[];

@Injectable()
export class RealtimeMatchStateService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SportRulesRegistry)
    private readonly sportRules: SportRulesRegistry,
    @Inject(RealtimeSessionRegistryService)
    private readonly sessionRegistry: RealtimeSessionRegistryService,
  ) {}

  async snapshot(
    matchId: string,
    viewer?:
      | { kind: 'legacy'; refereeSlot: RefereeSlot | null }
      | { assignmentId: string; kind: 'official'; refereePosition: number },
  ): Promise<MatchStatePayload> {
    const match = await this.prisma.match.findUnique({
      select: {
        athletes: {
          orderBy: { color: 'asc' },
          select: {
            color: true,
            id: true,
            name: true,
            organization: true,
          },
        },
        currentRound: true,
        lifecycle: true,
        finishedAt: true,
        id: true,
        publicId: true,
        rulesVersion: true,
        rounds: {
          orderBy: { roundNumber: 'desc' },
          select: {
            endedAt: true,
            endsAt: true,
            id: true,
            pausedAt: true,
            remainingDurationMs: true,
            roundNumber: true,
            stage: true,
            attemptNumber: true,
            startedAt: true,
          },
          where: { endedAt: null, invalidatedAt: null },
        },
        startedAt: true,
        status: true,
      },
      where: { id: matchId },
    });

    if (match === null) {
      throw new NotFoundException('Match not found');
    }

    const [
      scoreEvents,
      penaltyTotals,
      faults,
      presenceState,
      unresolvedWindow,
      validRounds,
      completedAppeal,
      completedOvertimeAppeal,
      validRoundResults,
    ] = await Promise.all([
      this.prisma.scoreEvent.findMany({
        select: {
          athleteId: true,
          revertedAt: true,
          roundId: true,
          type: true,
          value: true,
        },
        where: { matchId },
      }),
      this.prisma.penalty.groupBy({
        _count: { id: true },
        by: ['athleteId'],
        where: { matchId, revertedAt: null },
      }),
      this.prisma.fault.findMany({
        select: { athleteId: true, invalidatedAt: true, roundId: true },
        where: { matchId },
      }),
      this.presence(match.id, match.publicId),
      this.prisma.scoringWindow.findFirst({
        orderBy: { startedAt: 'asc' },
        select: {
          endsAt: true,
          id: true,
          roundNumber: true,
          round: { select: { stage: true, attemptNumber: true } },
          startedAt: true,
        },
        where: { invalidatedAt: null, matchId, resolvedAt: null },
      }),
      this.prisma.round.findMany({
        select: { endedAt: true, id: true, roundNumber: true },
        where: { invalidatedAt: null, matchId },
      }),
      this.prisma.matchAppeal.findFirst({
        where: {
          matchId,
          scope: 'REGULATION',
          attemptNumber: 0,
          status: 'COMPLETED',
          invalidatedAt: null,
        },
        include: {
          adjustments: { include: { athlete: { select: { color: true } } } },
        },
      }),
      this.prisma.matchAppeal.findFirst({
        where: {
          matchId,
          scope: 'OVERTIME',
          status: 'COMPLETED',
          invalidatedAt: null,
        },
        orderBy: { attemptNumber: 'desc' },
        include: {
          adjustments: { include: { athlete: { select: { color: true } } } },
        },
      }),
      this.prisma.roundAthleteResult.findMany({
        where: { matchId, invalidatedAt: null },
        select: { athleteId: true, roundId: true },
      }),
    ]);
    const canonical = calculateMatchScoreProjection({
      athletes: match.athletes.map(({ id, color }) => ({ id, color })),
      faults,
      scoreEvents,
      validRoundIds: validRounds.map((round) => round.id),
    });
    const scoresByAthlete = new Map(
      canonical.map((value) => [value.athleteId, value.refereeScore]),
    );
    const violationsByAthlete = new Map(
      penaltyTotals.map((total) => [total.athleteId, total._count.id]),
    );
    const faultByAthlete = new Map(
      canonical.map((value) => [value.athleteId, value.faultCount]),
    );
    const activeRound = this.activeRound(
      match.status,
      match.currentRound,
      match.rounds,
    );
    const activeScoringWindow =
      unresolvedWindow === null
        ? null
        : this.scoringWindowState(unresolvedWindow);
    const viewerState = await this.viewerState(
      viewer,
      unresolvedWindow,
      match.publicId,
    );

    return {
      activeRound,
      activeScoringWindow,
      athletes: match.athletes.map((athlete) => ({
        color: this.sharedAthleteColor(athlete.color),
        id: athlete.id,
        name: athlete.name,
        organization: athlete.organization,
        score:
          match.rulesVersion === MatchRulesVersion.FAULT_APPEAL_OVERTIME_V2
            ? (scoresByAthlete.get(athlete.id) ?? 0)
            : scoreEvents
                .filter(
                  (event) =>
                    event.athleteId === athlete.id && event.revertedAt === null,
                )
                .reduce((total, event) => total + event.value, 0),
        violations:
          match.rulesVersion === MatchRulesVersion.FAULT_APPEAL_OVERTIME_V2
            ? (faultByAthlete.get(athlete.id) ?? 0)
            : (violationsByAthlete.get(athlete.id) ?? 0),
      })),
      completion: this.completionCapability(
        match,
        validRounds,
        unresolvedWindow,
      ),
      result: this.resultCapability(
        match,
        validRounds,
        unresolvedWindow,
        completedAppeal,
        completedOvertimeAppeal,
        validRoundResults.length,
      ),
      exit: this.exitCapability(match, validRounds, unresolvedWindow),
      generatedAt: new Date().toISOString(),
      match: {
        currentRound: match.currentRound,
        finishedAt: match.finishedAt?.toISOString() ?? null,
        id: match.id,
        publicId: match.publicId,
        lifecycle: this.sharedMatchLifecycle(match.lifecycle),
        phase: this.sharedMatchStatus(match.status),
        rulesVersion: match.rulesVersion,
        startedAt: match.startedAt?.toISOString() ?? null,
        status: this.sharedMatchStatus(match.status),
      },
      presence: presenceState.presence,
      officials: presenceState.officials,
      readiness: this.readinessFromPresence(presenceState),
      scoreboardConnectedCount: presenceState.scoreboardConnectedCount,
      ...(viewerState === undefined ? {} : { viewer: viewerState }),
    };
  }

  private resultCapability(
    match: { lifecycle: MatchLifecycle; status: MatchStatus },
    rounds: Array<{ endedAt: Date | null; roundNumber: number }>,
    unresolved: { id: string } | null,
    appeal: {
      adjustments: Array<{
        baseRefereeScore: number;
        bonusPoints: number;
        penaltyPoints: number;
        finalScore: number;
        athlete: { color: AthleteColor };
      }>;
    } | null,
    overtimeAppeal: {
      adjustments: Array<{
        baseRefereeScore: number;
        bonusPoints: number;
        penaltyPoints: number;
        finalScore: number;
        athlete: { color: AthleteColor };
      }>;
    } | null,
    validRoundResultCount: number,
  ): ResultCapability {
    const reasons: ResultCapability['blockedReasons'] = [];
    if (match.lifecycle === MatchLifecycle.SUSPENDED)
      reasons.push('MATCH_SUSPENDED');
    if (match.lifecycle === MatchLifecycle.COMPLETED)
      reasons.push('MATCH_COMPLETED');
    if (unresolved) reasons.push('UNRESOLVED_SCORING_WINDOW');
    if (
      rounds.filter(
        (r) => r.endedAt && (r.roundNumber === 1 || r.roundNumber === 2),
      ).length !== 2 ||
      validRoundResultCount < 4
    )
      reasons.push('ROUND_SUMMARIES_MISSING');
    if (appeal) reasons.push('APPEAL_ALREADY_COMPLETED');
    if (match.status !== MatchStatus.REGULATION_APPEAL)
      reasons.push('NOT_REGULATION_APPEAL');
    const byColor = new Map(
      appeal?.adjustments.map((x) => [x.athlete.color, x]) ?? [],
    );
    const render = (color: AthleteColor) => {
      const x = byColor.get(color);
      return x
        ? {
            base: x.baseRefereeScore,
            bonusPoints: x.bonusPoints,
            penaltyPoints: x.penaltyPoints,
            final: x.finalScore,
          }
        : null;
    };
    const red = render(AthleteColor.RED);
    const blue = render(AthleteColor.BLUE);
    const overtimeByColor = new Map(
      overtimeAppeal?.adjustments.map((x) => [x.athlete.color, x]) ?? [],
    );
    const renderOvertime = (color: AthleteColor) => {
      const x = overtimeByColor.get(color);
      return x
        ? {
            base: x.baseRefereeScore,
            bonusPoints: x.bonusPoints,
            penaltyPoints: x.penaltyPoints,
            final: x.finalScore,
          }
        : null;
    };
    const overtimeRed = renderOvertime(AthleteColor.RED);
    const overtimeBlue = renderOvertime(AthleteColor.BLUE);
    return {
      canCompleteAppeal: reasons.length === 0,
      canStartOvertime: match.status === MatchStatus.OVERTIME_READY,
      canRestartOvertime:
        match.status === MatchStatus.OVERTIME_TIEBREAK_DECISION &&
        overtimeRed !== null &&
        overtimeBlue !== null &&
        overtimeRed.final === overtimeBlue.final,
      canSelectManualWinner:
        match.status === MatchStatus.OVERTIME_TIEBREAK_DECISION &&
        overtimeRed !== null &&
        overtimeBlue !== null &&
        overtimeRed.final === overtimeBlue.final,
      canPublishResult: match.status === MatchStatus.RESULT_PUBLICATION_READY,
      blockedReasons: reasons,
      regulation: { RED: red, BLUE: blue },
      overtime: { RED: overtimeRed, BLUE: overtimeBlue },
      isTie: red && blue ? red.final === blue.final : null,
    };
  }

  private completionCapability(
    match: { lifecycle: MatchLifecycle; status: MatchStatus },
    rounds: Array<{ endedAt: Date | null; roundNumber: number }>,
    unresolvedWindow: { id: string } | null,
  ): { canComplete: boolean; blockedReasons: MatchCompletionBlockedReason[] } {
    const blockedReasons: MatchCompletionBlockedReason[] = [];
    if (match.lifecycle === MatchLifecycle.COMPLETED)
      blockedReasons.push('ALREADY_COMPLETED');
    if (match.lifecycle === MatchLifecycle.SUSPENDED)
      blockedReasons.push('MATCH_SUSPENDED');
    const roundOne = rounds.find((round) => round.roundNumber === 1);
    const roundTwo = rounds.find((round) => round.roundNumber === 2);
    if (!roundOne?.endedAt) blockedReasons.push('ROUND_1_NOT_ENDED');
    if (!roundTwo?.endedAt) blockedReasons.push('ROUND_2_NOT_ENDED');
    if (unresolvedWindow !== null)
      blockedReasons.push('UNRESOLVED_SCORING_WINDOW');
    if (match.status !== MatchStatus.AWAITING_RESULT_SAVE)
      blockedReasons.push('NOT_AWAITING_RESULT_SAVE');
    return { canComplete: blockedReasons.length === 0, blockedReasons };
  }

  /** This projection is informational only; execute-time validation is repeated
   * under the locked Match row by MatchLifecycleService. */
  private exitCapability(
    match: { lifecycle: MatchLifecycle },
    rounds: Array<{ endedAt: Date | null; roundNumber: number }>,
    unresolvedWindow: { id: string } | null,
  ): MatchExitCapability {
    const blockedReasons: MatchExitBlockedReason[] = [];
    if (match.lifecycle === MatchLifecycle.COMPLETED) {
      blockedReasons.push('ALREADY_COMPLETED');
      return { canExit: false, allowedModes: [], blockedReasons };
    }
    const roundOneEnded = rounds.some(
      (round) => round.roundNumber === 1 && round.endedAt !== null,
    );
    const roundTwoEnded = rounds.some(
      (round) => round.roundNumber === 2 && round.endedAt !== null,
    );
    const allowedModes: MatchExitMode[] = [MatchExitMode.CANCEL_RESULTS];
    if (roundOneEnded && unresolvedWindow === null)
      allowedModes.push(MatchExitMode.SUSPEND_KEEP_ROUND_1);
    else if (!roundOneEnded) blockedReasons.push('ROUND_1_NOT_ENDED');
    if (roundTwoEnded && unresolvedWindow === null)
      allowedModes.push(MatchExitMode.SUSPEND_KEEP_ROUNDS_1_AND_2);
    else if (roundOneEnded)
      blockedReasons.push(
        unresolvedWindow === null
          ? 'ROUND_2_NOT_ENDED'
          : 'UNRESOLVED_SCORING_WINDOW',
      );
    return { canExit: true, allowedModes, blockedReasons };
  }

  async publicSnapshot(
    publicMatchId: string,
  ): Promise<PublicMatchStatePayload> {
    const match = await this.prisma.match.findUnique({
      select: { id: true },
      where: { publicId: publicMatchId },
    });

    if (match === null) {
      throw new NotFoundException('Match not found');
    }

    const [snapshot, outcome] = await Promise.all([
      this.snapshot(match.id),
      this.prisma.matchOutcome.findUnique({
        where: { matchId: match.id },
        select: { winnerColor: true, method: true },
      }),
    ]);
    return this.toPublicSnapshot(snapshot, outcome);
  }

  toPublicSnapshot(
    snapshot: MatchStatePayload,
    outcome?: {
      winnerColor: AthleteColor;
      method: MatchOutcomeMethod;
    } | null,
  ): PublicMatchStatePayload {
    return {
      activeRound: snapshot.activeRound
        ? (({ id: _id, ...round }) => round)(snapshot.activeRound)
        : null,
      athletes: snapshot.athletes.map(
        ({ color, name, organization, score, violations }) => ({
          color,
          name,
          organization,
          score,
          violations,
        }),
      ),
      generatedAt: snapshot.generatedAt,
      committedScores: {
        RED: snapshot.result.regulation.RED?.final ?? null,
        BLUE: snapshot.result.regulation.BLUE?.final ?? null,
      },
      match: {
        currentRound: snapshot.match.currentRound,
        finishedAt: snapshot.match.finishedAt,
        publicId: snapshot.match.publicId,
        lifecycle: snapshot.match.lifecycle,
        phase: snapshot.match.phase,
        status: snapshot.match.status,
        outcome: outcome
          ? {
              winner: this.sharedAthleteColor(outcome.winnerColor),
              method: outcome.method,
            }
          : null,
      },
    };
  }

  private async viewerState(
    viewer:
      | { kind: 'legacy'; refereeSlot: RefereeSlot | null }
      | { assignmentId: string; kind: 'official'; refereePosition: number }
      | undefined,
    unresolvedWindow: {
      endsAt: Date;
      id: string;
      roundNumber: number;
      startedAt: Date;
    } | null,
    matchPublicId: string,
  ): Promise<MatchStateViewer | undefined> {
    if (viewer === undefined) {
      return undefined;
    }

    if (
      unresolvedWindow === null ||
      (viewer.kind === 'legacy' && viewer.refereeSlot === null)
    ) {
      return { acceptedVote: null };
    }

    const vote = await this.prisma.refereeVote.findFirst({
      select: { athleteColor: true, serverReceivedAt: true },
      where: {
        scoringWindowId: unresolvedWindow.id,
        ...(viewer.kind === 'official'
          ? { assignmentId: viewer.assignmentId }
          : { refereeSlot: viewer.refereeSlot }),
      },
    });

    if (vote === null) return { acceptedVote: null };
    if (viewer.kind === 'official') {
      return {
        acceptedVote: {
          athlete: this.sharedAthleteColor(vote.athleteColor),
          identity: {
            assignmentId: viewer.assignmentId,
            kind: 'official',
            refereePosition: viewer.refereePosition,
          },
          matchPublicId,
          scoringWindowId: unresolvedWindow.id,
          serverReceivedAt: vote.serverReceivedAt.toISOString(),
        },
      };
    }
    if (viewer.refereeSlot === null) return { acceptedVote: null };
    return {
      acceptedVote: {
        athlete: this.sharedAthleteColor(vote.athleteColor),
        identity: {
          kind: 'legacy',
          refereeSlot: this.sharedRefereeSlot(viewer.refereeSlot),
        },
        matchPublicId,
        scoringWindowId: unresolvedWindow.id,
        serverReceivedAt: vote.serverReceivedAt.toISOString(),
      },
    };
  }

  private activeRound(
    status: MatchStatus,
    currentRound: number | null,
    rounds: Array<{
      endedAt: Date | null;
      endsAt: Date;
      id: string;
      pausedAt: Date | null;
      remainingDurationMs: number | null;
      roundNumber: number;
      stage: RoundStage;
      attemptNumber: number;
      startedAt: Date;
    }>,
  ): MatchRoundState | null {
    if (
      status !== MatchStatus.ROUND_1_RUNNING &&
      status !== MatchStatus.ROUND_1_PAUSED &&
      status !== MatchStatus.ROUND_2_RUNNING &&
      status !== MatchStatus.ROUND_2_PAUSED &&
      status !== MatchStatus.OVERTIME_RUNNING &&
      status !== MatchStatus.OVERTIME_PAUSED
    ) {
      return null;
    }

    const round = rounds.find(
      (candidate) =>
        candidate.roundNumber === currentRound &&
        (status === MatchStatus.OVERTIME_RUNNING ||
        status === MatchStatus.OVERTIME_PAUSED
          ? candidate.stage === 'OVERTIME'
          : candidate.stage === 'REGULATION'),
    );

    if (round === undefined) {
      return null;
    }

    if (
      round.stage === 'REGULATION' &&
      round.roundNumber !== 1 &&
      round.roundNumber !== 2
    ) {
      throw new Error(`Unsupported round number: ${String(round.roundNumber)}`);
    }

    return {
      endedAt: round.endedAt?.toISOString() ?? null,
      endsAt: round.endsAt.toISOString(),
      id: round.id,
      pausedAt: round.pausedAt?.toISOString() ?? null,
      remainingDurationMs: round.remainingDurationMs,
      ...(round.stage === 'REGULATION'
        ? {
            roundNumber: round.roundNumber as 1 | 2,
            stage: 'REGULATION' as const,
            attemptNumber: 0,
          }
        : {
            roundNumber: round.roundNumber,
            stage: 'OVERTIME' as const,
            attemptNumber: round.attemptNumber,
          }),
      startedAt: round.startedAt.toISOString(),
    };
  }

  private scoringWindowState(window: {
    endsAt: Date;
    id: string;
    roundNumber: number;
    round: {
      stage: RoundStage;
      attemptNumber: number;
    } | null;
    startedAt: Date;
  }): MatchScoringWindowState {
    if (window.round === null) {
      throw new Error('Scoring window is missing its round descriptor');
    }
    if (
      window.round.stage === 'REGULATION' &&
      window.roundNumber !== 1 &&
      window.roundNumber !== 2
    ) {
      throw new Error(
        `Unsupported scoring window round number: ${String(window.roundNumber)}`,
      );
    }

    const descriptor =
      window.round.stage === 'REGULATION'
        ? {
            stage: 'REGULATION' as const,
            roundNumber: window.roundNumber as 1 | 2,
            attemptNumber: 0 as const,
          }
        : {
            stage: 'OVERTIME' as const,
            roundNumber: window.roundNumber,
            attemptNumber: window.round.attemptNumber,
          };

    return {
      endsAt: window.endsAt.toISOString(),
      id: window.id,
      ...descriptor,
      startedAt: window.startedAt.toISOString(),
    };
  }

  async presenceUpdated(
    matchId: string,
    matchPublicId: string,
  ): Promise<PresenceUpdatedPayload> {
    const presenceState = await this.presence(matchId, matchPublicId);
    return {
      matchPublicId,
      ...presenceState,
      updatedAt: new Date().toISOString(),
    };
  }

  async presenceUpdatedForPublicMatch(
    matchPublicId: string,
  ): Promise<PresenceUpdatedPayload> {
    const match = await this.prisma.match.findUnique({
      select: { id: true },
      where: { publicId: matchPublicId },
    });
    if (match === null) {
      throw new NotFoundException('Match not found');
    }

    return this.presenceUpdated(match.id, matchPublicId);
  }

  async startReadiness(
    matchId: string,
    matchPublicId: string,
  ): Promise<MatchStartReadinessDetails> {
    const { officials, scoreboardConnectedCount, requiredRefereeCount } =
      await this.presence(matchId, matchPublicId);
    return this.officialReadinessFromPresence({
      officials,
      scoreboardConnectedCount,
      requiredRefereeCount,
    });
  }

  private readinessFromPresence(presenceState: {
    officials: MatchOfficialPresenceEntry[];
    presence: MatchPresenceEntry[];
    scoreboardConnectedCount: number;
    requiredRefereeCount: number;
  }): MatchReadiness {
    if (presenceState.officials.length === 0) {
      const connectedRoles = new Set(
        presenceState.presence
          .filter((entry) => entry.connected)
          .map((entry) => entry.accessRole),
      );
      const referees = {
        REFEREE_1: connectedRoles.has(SharedMatchAccessRole.REFEREE_1),
        REFEREE_2: connectedRoles.has(SharedMatchAccessRole.REFEREE_2),
        REFEREE_3: connectedRoles.has(SharedMatchAccessRole.REFEREE_3),
      };
      const missingRequirements: string[] = [];
      if (!connectedRoles.has(SharedMatchAccessRole.INSPECTOR)) {
        missingRequirements.push('INSPECTOR');
      }
      if (presenceState.requiredRefereeCount !== 3) {
        missingRequirements.push('REFEREE_ASSIGNMENTS');
      }
      if (Object.values(referees).some((connected) => !connected)) {
        missingRequirements.push('REFEREES');
      }
      if (presenceState.scoreboardConnectedCount < 1) {
        missingRequirements.push('SCOREBOARD');
      }
      return {
        canStartRound: missingRequirements.length === 0,
        kind: 'LEGACY_MATCH_ACCESS',
        missingRequirements,
        requiredRefereeCount: presenceState.requiredRefereeCount,
        referees,
        scoreboardConnectedCount: presenceState.scoreboardConnectedCount,
      };
    }

    return this.officialReadinessFromPresence(presenceState);
  }

  private officialReadinessFromPresence(presenceState: {
    officials: MatchOfficialPresenceEntry[];
    scoreboardConnectedCount: number;
    requiredRefereeCount: number;
  }): MatchStartReadinessDetails & {
    canStartRound: boolean;
    kind: 'TOURNAMENT_OFFICIALS';
  } {
    const referees = presenceState.officials
      .filter((x) => x.role === 'REFEREE')
      .map((x) => ({
        officialId: x.officialId,
        name: x.name,
        position: x.refereePosition ?? 0,
        assigned: true,
        connected: x.connected,
      }));
    const inspectorEntry = presenceState.officials.filter(
      (x) => x.role === 'INSPECTOR',
    );
    const inspectorRecord = inspectorEntry[0];
    const inspector =
      inspectorRecord && inspectorEntry.length === 1
        ? {
            officialId: inspectorRecord.officialId,
            assigned: true,
            connected: inspectorRecord.connected,
          }
        : { officialId: null, assigned: false, connected: false };
    const missingRequirements: string[] = [];
    if (!inspector.assigned) missingRequirements.push('INSPECTOR_ASSIGNMENT');
    if (!inspector.connected)
      missingRequirements.push('INSPECTOR_DISCONNECTED');
    if (referees.length !== presenceState.requiredRefereeCount)
      missingRequirements.push('REFEREE_ASSIGNMENTS');
    if (referees.some((x) => !x.connected))
      missingRequirements.push('REFEREE_DISCONNECTED');
    if (presenceState.scoreboardConnectedCount < 1) {
      missingRequirements.push('SCOREBOARD');
    }
    return {
      canStartRound: missingRequirements.length === 0,
      assignedRefereeCount: referees.length,
      connectedRefereeCount: referees.filter((x) => x.connected).length,
      inspector,
      kind: 'TOURNAMENT_OFFICIALS',
      missingRequirements,
      requiredRefereeCount: presenceState.requiredRefereeCount,
      referees,
      scoreboardConnectedCount: presenceState.scoreboardConnectedCount,
    };
  }

  private async rulesForMatch(matchId: string) {
    const match = await this.prisma.match.findUniqueOrThrow({
      select: {
        tournament: {
          select: {
            sport: { select: { sportGroup: { select: { code: true } } } },
          },
        },
      },
      where: { id: matchId },
    });
    return this.sportRules.resolve(match.tournament.sport.sportGroup.code);
  }

  private async presence(
    matchId: string,
    matchPublicId: string,
  ): Promise<{
    officials: MatchOfficialPresenceEntry[];
    presence: MatchPresenceEntry[];
    scoreboardConnectedCount: number;
    requiredRefereeCount: number;
  }> {
    const [activeOwners, scoreboardConnectedCount, officialAssignments, match] =
      await Promise.all([
        this.prisma.matchSession.findMany({
          select: { accessCode: { select: { role: true } } },
          where: {
            active: true,
            expiresAt: { gt: new Date() },
            matchId,
            revokedAt: null,
          },
        }),
        this.sessionRegistry.scoreboardConnectedCount(matchPublicId),
        this.prisma.matchOfficialAssignment.findMany({
          where: { matchId, releasedAt: null },
          orderBy: [{ role: 'asc' }, { refereePosition: 'asc' }],
          select: {
            officialId: true,
            role: true,
            refereePosition: true,
            official: {
              select: {
                name: true,
                sessions: {
                  where: {
                    active: true,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                  },
                  select: { id: true },
                },
              },
            },
          },
        }),
        this.prisma.match.findUniqueOrThrow({
          where: { id: matchId },
          select: { requiredRefereeCount: true },
        }),
      ]);
    const activeRoles = new Set<string>(
      activeOwners.map(({ accessCode }) => accessCode.role),
    );

    const presence = await Promise.all(
      ACCESS_ROLES.map(async (accessRole) => {
        const connectedSocketCount =
          await this.sessionRegistry.connectedSocketCount(
            matchPublicId,
            accessRole,
          );

        return {
          accessRole: this.sharedAccessRole(accessRole),
          activeSession: activeRoles.has(accessRole),
          connected: connectedSocketCount > 0,
          connectedSocketCount,
        };
      }),
    );

    const officials = await Promise.all(
      officialAssignments.map(async (assignment) => {
        const connectedSocketCount =
          await this.sessionRegistry.officialConnectedSocketCount(
            matchPublicId,
            assignment.officialId,
          );
        return {
          activeSession: assignment.official.sessions.length > 0,
          connected: connectedSocketCount > 0,
          connectedSocketCount,
          name: assignment.official.name,
          officialId: assignment.officialId,
          refereePosition: assignment.refereePosition,
          role: assignment.role,
        };
      }),
    );
    return {
      officials,
      presence,
      scoreboardConnectedCount,
      requiredRefereeCount: match.requiredRefereeCount,
    };
  }

  private sharedAccessRole(role: MatchAccessRole): SharedMatchAccessRole {
    switch (role) {
      case MatchAccessRole.REFEREE_1:
        return SharedMatchAccessRole.REFEREE_1;
      case MatchAccessRole.REFEREE_2:
        return SharedMatchAccessRole.REFEREE_2;
      case MatchAccessRole.REFEREE_3:
        return SharedMatchAccessRole.REFEREE_3;
      case MatchAccessRole.INSPECTOR:
        return SharedMatchAccessRole.INSPECTOR;
      default: {
        const exhaustiveRole: never = role;
        throw new Error(`Unsupported match access role: ${exhaustiveRole}`);
      }
    }
  }

  private sharedRefereeSlot(slot: RefereeSlot): SharedRefereeSlot {
    switch (slot) {
      case RefereeSlot.REFEREE_1:
        return SharedRefereeSlot.REFEREE_1;
      case RefereeSlot.REFEREE_2:
        return SharedRefereeSlot.REFEREE_2;
      case RefereeSlot.REFEREE_3:
        return SharedRefereeSlot.REFEREE_3;
      default: {
        const exhaustiveSlot: never = slot;
        throw new Error(`Unsupported referee slot: ${exhaustiveSlot}`);
      }
    }
  }

  private sharedAthleteColor(color: AthleteColor): SharedAthleteColor {
    switch (color) {
      case AthleteColor.RED:
        return SharedAthleteColor.RED;
      case AthleteColor.BLUE:
        return SharedAthleteColor.BLUE;
      default: {
        const exhaustiveColor: never = color;
        throw new Error(`Unsupported athlete color: ${exhaustiveColor}`);
      }
    }
  }

  private sharedMatchStatus(status: MatchStatus): SharedMatchStatus {
    switch (status) {
      case MatchStatus.WAITING:
        return SharedMatchStatus.WAITING;
      case MatchStatus.ROUND_1_RUNNING:
        return SharedMatchStatus.ROUND_1_RUNNING;
      case MatchStatus.ROUND_1_PAUSED:
        return SharedMatchStatus.ROUND_1_PAUSED;
      case MatchStatus.BREAK:
        return SharedMatchStatus.BREAK;
      case MatchStatus.ROUND_2_RUNNING:
        return SharedMatchStatus.ROUND_2_RUNNING;
      case MatchStatus.ROUND_2_PAUSED:
        return SharedMatchStatus.ROUND_2_PAUSED;
      case MatchStatus.AWAITING_RESULT_SAVE:
        return SharedMatchStatus.AWAITING_RESULT_SAVE;
      case MatchStatus.REGULATION_APPEAL:
        return SharedMatchStatus.REGULATION_APPEAL;
      case MatchStatus.OVERTIME_READY:
        return SharedMatchStatus.OVERTIME_READY;
      case MatchStatus.OVERTIME_RUNNING:
        return SharedMatchStatus.OVERTIME_RUNNING;
      case MatchStatus.OVERTIME_PAUSED:
        return SharedMatchStatus.OVERTIME_PAUSED;
      case MatchStatus.OVERTIME_APPEAL:
        return SharedMatchStatus.OVERTIME_APPEAL;
      case MatchStatus.OVERTIME_TIEBREAK_DECISION:
        return SharedMatchStatus.OVERTIME_TIEBREAK_DECISION;
      case MatchStatus.RESULT_PUBLICATION_READY:
        return SharedMatchStatus.RESULT_PUBLICATION_READY;
      case MatchStatus.FINISHED:
        return SharedMatchStatus.FINISHED;
      default: {
        const exhaustiveStatus: never = status;
        throw new Error(`Unsupported match status: ${exhaustiveStatus}`);
      }
    }
  }

  private sharedMatchLifecycle(
    lifecycle: MatchLifecycle,
  ): SharedMatchLifecycle {
    switch (lifecycle) {
      case MatchLifecycle.NOT_STARTED:
        return SharedMatchLifecycle.NOT_STARTED;
      case MatchLifecycle.IN_PROGRESS:
        return SharedMatchLifecycle.IN_PROGRESS;
      case MatchLifecycle.SUSPENDED:
        return SharedMatchLifecycle.SUSPENDED;
      case MatchLifecycle.COMPLETED:
        return SharedMatchLifecycle.COMPLETED;
      default: {
        const exhaustiveLifecycle: never = lifecycle;
        throw new Error(`Unsupported match lifecycle: ${exhaustiveLifecycle}`);
      }
    }
  }
}
