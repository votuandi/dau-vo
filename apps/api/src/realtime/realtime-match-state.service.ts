import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AthleteColor as SharedAthleteColor,
  MatchAccessRole as SharedMatchAccessRole,
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
  type PresenceUpdatedPayload,
  RefereeSlot as SharedRefereeSlot,
} from '@martial-arts-scoring/shared-types';
import {
  AthleteColor,
  MatchAccessRole,
  MatchStatus,
  RefereeSlot,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { RealtimeSessionRegistryService } from './realtime-session-registry.service';

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
    viewer?: { refereeSlot: RefereeSlot | null },
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
        finishedAt: true,
        id: true,
        publicId: true,
        rounds: {
          orderBy: { roundNumber: 'desc' },
          select: {
            endedAt: true,
            endsAt: true,
            id: true,
            pausedAt: true,
            remainingDurationMs: true,
            roundNumber: true,
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

    const [scoreTotals, penaltyTotals, presenceState, unresolvedWindow] =
      await Promise.all([
        this.prisma.scoreEvent.groupBy({
          _sum: { value: true },
          by: ['athleteId'],
          where: { matchId, revertedAt: null },
        }),
        this.prisma.penalty.groupBy({
          _count: { id: true },
          by: ['athleteId'],
          where: { matchId, revertedAt: null },
        }),
        this.presence(match.id, match.publicId),
        this.prisma.scoringWindow.findFirst({
          orderBy: { startedAt: 'asc' },
          select: {
            endsAt: true,
            id: true,
            roundNumber: true,
            startedAt: true,
          },
          where: { invalidatedAt: null, matchId, resolvedAt: null },
        }),
      ]);
    const scoresByAthlete = new Map(
      scoreTotals.map((total) => [total.athleteId, total._sum.value ?? 0]),
    );
    const violationsByAthlete = new Map(
      penaltyTotals.map((total) => [total.athleteId, total._count.id]),
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
        score: scoresByAthlete.get(athlete.id) ?? 0,
        violations: violationsByAthlete.get(athlete.id) ?? 0,
      })),
      generatedAt: new Date().toISOString(),
      match: {
        currentRound: match.currentRound,
        finishedAt: match.finishedAt?.toISOString() ?? null,
        id: match.id,
        publicId: match.publicId,
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

    return this.toPublicSnapshot(await this.snapshot(match.id));
  }

  toPublicSnapshot(snapshot: MatchStatePayload): PublicMatchStatePayload {
    return {
      activeRound: snapshot.activeRound,
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
      match: {
        currentRound: snapshot.match.currentRound,
        finishedAt: snapshot.match.finishedAt,
        publicId: snapshot.match.publicId,
        status: snapshot.match.status,
      },
    };
  }

  private async viewerState(
    viewer: { refereeSlot: RefereeSlot | null } | undefined,
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

    if (viewer.refereeSlot === null || unresolvedWindow === null) {
      return { acceptedVote: null };
    }

    const vote = await this.prisma.refereeVote.findFirst({
      select: { athleteColor: true, serverReceivedAt: true },
      where: {
        scoringWindowId: unresolvedWindow.id,
        refereeSlot: viewer.refereeSlot,
      },
    });

    return {
      acceptedVote:
        vote === null
          ? null
          : {
              athlete: this.sharedAthleteColor(vote.athleteColor),
              matchPublicId,
              assignmentId: '',
              refereePosition: 0,
              refereeSlot: this.sharedRefereeSlot(viewer.refereeSlot),
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
      startedAt: Date;
    }>,
  ): MatchRoundState | null {
    if (
      status !== MatchStatus.ROUND_1_RUNNING &&
      status !== MatchStatus.ROUND_1_PAUSED &&
      status !== MatchStatus.ROUND_2_RUNNING &&
      status !== MatchStatus.ROUND_2_PAUSED
    ) {
      return null;
    }

    const round = rounds.find(
      (candidate) => candidate.roundNumber === currentRound,
    );

    if (round === undefined) {
      return null;
    }

    if (round.roundNumber !== 1 && round.roundNumber !== 2) {
      throw new Error(`Unsupported round number: ${String(round.roundNumber)}`);
    }

    return {
      endedAt: round.endedAt?.toISOString() ?? null,
      endsAt: round.endsAt.toISOString(),
      id: round.id,
      pausedAt: round.pausedAt?.toISOString() ?? null,
      remainingDurationMs: round.remainingDurationMs,
      roundNumber: round.roundNumber,
      startedAt: round.startedAt.toISOString(),
    };
  }

  private scoringWindowState(window: {
    endsAt: Date;
    id: string;
    roundNumber: number;
    startedAt: Date;
  }): MatchScoringWindowState {
    if (window.roundNumber !== 1 && window.roundNumber !== 2) {
      throw new Error(
        `Unsupported scoring window round number: ${String(window.roundNumber)}`,
      );
    }

    return {
      endsAt: window.endsAt.toISOString(),
      id: window.id,
      roundNumber: window.roundNumber,
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
      case MatchStatus.FINISHED:
        return SharedMatchStatus.FINISHED;
      default: {
        const exhaustiveStatus: never = status;
        throw new Error(`Unsupported match status: ${exhaustiveStatus}`);
      }
    }
  }
}
