import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AthleteColor as SharedAthleteColor,
  MatchAccessRole as SharedMatchAccessRole,
  MatchStatus as SharedMatchStatus,
  type MatchPresenceEntry,
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
            roundNumber: true,
            startedAt: true,
          },
          where: { endedAt: null },
        },
        startedAt: true,
        status: true,
      },
      where: { id: matchId },
    });

    if (match === null) {
      throw new NotFoundException('Match not found');
    }

    const [scoreTotals, penaltyTotals, presence, unresolvedWindow] =
      await Promise.all([
        this.prisma.scoreEvent.groupBy({
          _sum: { value: true },
          by: ['athleteId'],
          where: { matchId },
        }),
        this.prisma.penalty.groupBy({
          _count: { id: true },
          by: ['athleteId'],
          where: { matchId },
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
          where: { matchId, resolvedAt: null },
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
      presence,
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

    const vote = await this.prisma.refereeVote.findUnique({
      select: { athleteColor: true, serverReceivedAt: true },
      where: {
        scoringWindowId_refereeSlot: {
          refereeSlot: viewer.refereeSlot,
          scoringWindowId: unresolvedWindow.id,
        },
      },
    });

    return {
      acceptedVote:
        vote === null
          ? null
          : {
              athlete: this.sharedAthleteColor(vote.athleteColor),
              matchPublicId,
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
      roundNumber: number;
      startedAt: Date;
    }>,
  ): MatchRoundState | null {
    if (
      status !== MatchStatus.ROUND_1_RUNNING &&
      status !== MatchStatus.ROUND_2_RUNNING
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
    return {
      matchPublicId,
      presence: await this.presence(matchId, matchPublicId),
      updatedAt: new Date().toISOString(),
    };
  }

  private async presence(
    matchId: string,
    matchPublicId: string,
  ): Promise<MatchPresenceEntry[]> {
    const activeOwners = await this.prisma.matchSession.findMany({
      select: { accessCode: { select: { role: true } } },
      where: {
        active: true,
        expiresAt: { gt: new Date() },
        matchId,
        revokedAt: null,
      },
    });
    const activeRoles = new Set<string>(
      activeOwners.map(({ accessCode }) => accessCode.role),
    );

    return Promise.all(
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
      case MatchStatus.BREAK:
        return SharedMatchStatus.BREAK;
      case MatchStatus.ROUND_2_RUNNING:
        return SharedMatchStatus.ROUND_2_RUNNING;
      case MatchStatus.FINISHED:
        return SharedMatchStatus.FINISHED;
      default: {
        const exhaustiveStatus: never = status;
        throw new Error(`Unsupported match status: ${exhaustiveStatus}`);
      }
    }
  }
}
