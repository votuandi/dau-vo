import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  AthleteColor as SharedAthleteColor,
  RefereeSlot as SharedRefereeSlot,
  type ScoreUpdatedPayload,
  type ScoringWindowOpenedPayload,
  type ScoringWindowResolvedPayload,
  type VoteAcceptedPayload,
} from '@martial-arts-scoring/shared-types';
import {
  AthleteColor,
  AuditEventType,
  MatchStatus,
  RefereeSlot,
  ScoreEventType,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { activeRoundElapsedMs } from './round-timing';
import {
  DuplicateRefereeVoteError,
  InactiveVoteSessionError,
  MatchNotRunningForVoteError,
  RoundPausedForVoteError,
  PriorScoringWindowPendingError,
  RoundEndedForVoteError,
} from './scoring.errors';

/** Official duration of a persisted referee voting window. */
export const SCORING_WINDOW_DURATION_MS = 1_000;

const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const RESOLUTION_RETRY_DELAY_MS = 1_000;

interface LockedRow {
  id: string;
}

interface ServerClock {
  serverNow: Date;
}

interface ActiveRound {
  durationMs: number | null;
  endsAt: Date;
  id: string;
  roundNumber: number;
  startedAt: Date;
}

interface WindowRow {
  endsAt: Date;
  id: string;
  matchId: string;
  roundElapsedMs: number | null;
  roundId: string | null;
  roundNumber: number;
  startedAt: Date;
}

interface ScheduledResolution {
  timer: NodeJS.Timeout;
}

export interface ScoringResolutionTransition {
  matchId: string;
  payload: ScoringWindowResolvedPayload;
  scoreUpdated: ScoreUpdatedPayload | null;
}

export interface VoteSubmissionTransition {
  accepted: VoteAcceptedPayload;
  opened: ScoringWindowOpenedPayload | null;
  resolvedBeforeAcceptance: ScoringResolutionTransition | null;
}

type ScoringResolutionListener = (
  transition: ScoringResolutionTransition,
) => Promise<void>;

/**
 * Returns whether an authoritative server timestamp belongs to a window.
 * This intentionally implements the half-open official interval:
 * `startedAt <= serverReceivedAt < endsAt`.
 */
export function isWithinScoringWindow(
  serverReceivedAt: Date,
  startedAt: Date,
  endsAt: Date,
): boolean {
  const received = serverReceivedAt.getTime();
  return received >= startedAt.getTime() && received < endsAt.getTime();
}

/**
 * PostgreSQL is the distributed ownership authority for scoring. Every vote
 * intake and resolution locks its Match row (`FOR UPDATE`), so all NestJS
 * instances serialize decisions for one match. The database partial unique
 * indexes are final guards for one open window and one point event per window.
 * Redis is deliberately not an authority for score state: losing or evicting
 * a Redis lock must never create a duplicate official score.
 */
@Injectable()
export class ScoringService implements OnModuleDestroy {
  private readonly logger = new Logger(ScoringService.name);
  private readonly scheduledResolutions = new Map<
    string,
    ScheduledResolution
  >();
  private resolutionListener: ScoringResolutionListener | undefined;
  private shuttingDown = false;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SportRulesRegistry)
    private readonly sportRules: SportRulesRegistry,
  ) {}

  onModuleDestroy(): void {
    this.shuttingDown = true;
    for (const scheduled of this.scheduledResolutions.values()) {
      clearTimeout(scheduled.timer);
    }
    this.scheduledResolutions.clear();
  }

  async initializeResolutionRecovery(
    listener: ScoringResolutionListener,
  ): Promise<void> {
    this.resolutionListener = listener;
    const windows = await this.prisma.scoringWindow.findMany({
      select: { endsAt: true, id: true, matchId: true },
      where: { invalidatedAt: null, resolvedAt: null },
    });

    for (const window of windows) {
      await this.handleResolution(window.matchId, window.id);
    }
  }

  async submitVote(input: {
    athlete: AthleteColor;
    matchId: string;
    refereeSlot: RefereeSlot;
    sessionId: string;
  }): Promise<VoteSubmissionTransition> {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, input.matchId);
        await this.rulesForMatch(transaction, input.matchId);
        await this.lockActiveRefereeSession(
          transaction,
          input.matchId,
          input.sessionId,
          input.refereeSlot,
        );
        // Sample time after the distributed Match lock. This produces one
        // ordered PostgreSQL clock for simultaneous requests across instances.
        const clock = await this.serverClock(transaction);
        const match = await transaction.match.findUniqueOrThrow({
          select: {
            currentRound: true,
            publicId: true,
            rounds: {
              select: {
                durationMs: true,
                endsAt: true,
                id: true,
                roundNumber: true,
                startedAt: true,
              },
              where: { endedAt: null },
            },
            status: true,
          },
          where: { id: input.matchId },
        });
        if (
          match.status === MatchStatus.ROUND_1_PAUSED ||
          match.status === MatchStatus.ROUND_2_PAUSED
        ) {
          throw new RoundPausedForVoteError();
        }
        const activeRound = this.activeRound(match);

        if (activeRound === null) {
          throw new MatchNotRunningForVoteError();
        }
        if (clock.serverNow.getTime() >= activeRound.endsAt.getTime()) {
          throw new RoundEndedForVoteError();
        }

        let unresolved = await transaction.scoringWindow.findFirst({
          orderBy: { startedAt: 'asc' },
          select: {
            endsAt: true,
            id: true,
            matchId: true,
            roundElapsedMs: true,
            roundId: true,
            roundNumber: true,
            startedAt: true,
          },
          where: {
            invalidatedAt: null,
            matchId: input.matchId,
            resolvedAt: null,
          },
        });
        let resolvedBeforeAcceptance: ScoringResolutionTransition | null = null;

        if (
          unresolved !== null &&
          clock.serverNow.getTime() >= unresolved.endsAt.getTime()
        ) {
          resolvedBeforeAcceptance = await this.resolveLockedWindow(
            transaction,
            unresolved,
            clock.serverNow,
            match.publicId,
          );
          unresolved = null;
        }

        if (
          unresolved !== null &&
          unresolved.roundNumber !== activeRound.roundNumber
        ) {
          throw new PriorScoringWindowPendingError();
        }

        if (unresolved !== null) {
          if (
            !isWithinScoringWindow(
              clock.serverNow,
              unresolved.startedAt,
              unresolved.endsAt,
            )
          ) {
            throw new RoundEndedForVoteError();
          }
          const existing = await transaction.refereeVote.findUnique({
            select: { id: true },
            where: {
              scoringWindowId_refereeSlot: {
                refereeSlot: input.refereeSlot,
                scoringWindowId: unresolved.id,
              },
            },
          });

          if (existing !== null) {
            throw new DuplicateRefereeVoteError();
          }

          const vote = await transaction.refereeVote.create({
            data: {
              athleteColor: input.athlete,
              matchId: input.matchId,
              refereeSlot: input.refereeSlot,
              scoringWindowId: unresolved.id,
              serverReceivedAt: clock.serverNow,
              sessionId: input.sessionId,
            },
            select: { serverReceivedAt: true },
          });

          return {
            accepted: this.acceptedPayload(
              input.athlete,
              match.publicId,
              input.refereeSlot,
              unresolved.id,
              vote.serverReceivedAt,
            ),
            opened: null,
            resolvedBeforeAcceptance,
            serverNow: clock.serverNow,
            windowEndsAt: unresolved.endsAt,
            windowId: unresolved.id,
          };
        }

        const endsAt = new Date(
          clock.serverNow.getTime() + SCORING_WINDOW_DURATION_MS,
        );
        const window = await transaction.scoringWindow.create({
          data: {
            endsAt,
            matchId: input.matchId,
            roundElapsedMs: activeRoundElapsedMs(activeRound, clock.serverNow),
            roundId: activeRound.id,
            roundNumber: activeRound.roundNumber,
            startedAt: clock.serverNow,
          },
          select: {
            endsAt: true,
            id: true,
            roundElapsedMs: true,
            roundId: true,
            roundNumber: true,
            startedAt: true,
          },
        });
        const vote = await transaction.refereeVote.create({
          data: {
            athleteColor: input.athlete,
            matchId: input.matchId,
            refereeSlot: input.refereeSlot,
            scoringWindowId: window.id,
            serverReceivedAt: clock.serverNow,
            sessionId: input.sessionId,
          },
          select: { serverReceivedAt: true },
        });

        return {
          accepted: this.acceptedPayload(
            input.athlete,
            match.publicId,
            input.refereeSlot,
            window.id,
            vote.serverReceivedAt,
          ),
          opened: {
            matchPublicId: match.publicId,
            window: {
              endsAt: window.endsAt.toISOString(),
              id: window.id,
              roundNumber: this.roundNumber(window.roundNumber),
              startedAt: window.startedAt.toISOString(),
            },
          },
          resolvedBeforeAcceptance,
          serverNow: clock.serverNow,
          windowEndsAt: window.endsAt,
          windowId: window.id,
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );

    this.scheduleResolution(
      input.matchId,
      result.windowId,
      result.windowEndsAt,
      result.serverNow,
    );
    return {
      accepted: result.accepted,
      opened: result.opened,
      resolvedBeforeAcceptance: result.resolvedBeforeAcceptance,
    };
  }

  private async handleResolution(
    matchId: string,
    windowId: string,
  ): Promise<void> {
    const decision = await this.resolveIfDue(matchId, windowId);
    if (decision.kind === 'pending') {
      this.scheduleResolutionAfter(matchId, windowId, decision.delayMs);
      return;
    }
    this.cancelResolution(windowId);
    if (decision.kind !== 'resolved') {
      return;
    }

    try {
      await this.resolutionListener?.(decision.transition);
    } catch (error: unknown) {
      this.logger.error(
        { error, matchId, windowId },
        'Scoring resolution committed but realtime publication failed',
      );
    }
  }

  private async resolveIfDue(
    matchId: string,
    windowId: string,
  ): Promise<
    | { kind: 'inactive' }
    | { delayMs: number; kind: 'pending' }
    | { kind: 'resolved'; transition: ScoringResolutionTransition }
  > {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, matchId);
        await this.rulesForMatch(transaction, matchId);
        const clock = await this.serverClock(transaction);
        const [match, window] = await Promise.all([
          transaction.match.findUniqueOrThrow({
            select: { publicId: true },
            where: { id: matchId },
          }),
          transaction.scoringWindow.findFirst({
            select: {
              endsAt: true,
              id: true,
              matchId: true,
              roundElapsedMs: true,
              roundId: true,
              roundNumber: true,
              startedAt: true,
            },
            where: {
              id: windowId,
              invalidatedAt: null,
              matchId,
              resolvedAt: null,
            },
          }),
        ]);
        if (window === null) {
          return { kind: 'inactive' };
        }
        const delayMs = window.endsAt.getTime() - clock.serverNow.getTime();
        if (delayMs > 0) {
          return { delayMs, kind: 'pending' };
        }
        return {
          kind: 'resolved',
          transition: await this.resolveLockedWindow(
            transaction,
            window,
            clock.serverNow,
            match.publicId,
          ),
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  private async resolveLockedWindow(
    transaction: Prisma.TransactionClient,
    window: WindowRow,
    resolvedAt: Date,
    matchPublicId: string,
  ): Promise<ScoringResolutionTransition> {
    const rules = await this.rulesForMatch(transaction, window.matchId);
    const votes = await transaction.refereeVote.findMany({
      orderBy: { serverReceivedAt: 'asc' },
      select: { athleteColor: true, refereeSlot: true, serverReceivedAt: true },
      where: { scoringWindowId: window.id },
    });
    const redVotes = votes.filter(
      (vote) => vote.athleteColor === AthleteColor.RED,
    ).length;
    const blueVotes = votes.filter(
      (vote) => vote.athleteColor === AthleteColor.BLUE,
    ).length;
    const winningColor =
      redVotes >= rules.refereeMajorityThreshold
        ? AthleteColor.RED
        : blueVotes >= rules.refereeMajorityThreshold
          ? AthleteColor.BLUE
          : null;

    const updated = await transaction.scoringWindow.updateMany({
      data: {
        resolvedAt,
        scoreAwarded: winningColor !== null,
        winningColor,
      },
      where: { id: window.id, invalidatedAt: null, resolvedAt: null },
    });
    if (updated.count !== 1) {
      throw new Error(
        'A locked scoring window could not be resolved exactly once',
      );
    }

    let scoreUpdated: ScoreUpdatedPayload | null = null;
    if (winningColor !== null) {
      const athlete = await transaction.matchAthlete.findUniqueOrThrow({
        select: { id: true },
        where: {
          matchId_color: { color: winningColor, matchId: window.matchId },
        },
      });
      await transaction.scoreEvent.create({
        data: {
          athleteId: athlete.id,
          matchId: window.matchId,
          occurredAt: window.startedAt,
          roundElapsedMs: window.roundElapsedMs,
          roundId: window.roundId,
          roundNumber: window.roundNumber,
          scoringWindowId: window.id,
          type: ScoreEventType.REFEREE_POINT,
          value: rules.refereePointValue,
        },
        select: { id: true },
      });
      scoreUpdated = await this.scoreUpdatedPayload(
        transaction,
        window.matchId,
        matchPublicId,
        window.id,
        resolvedAt,
      );
    }

    await transaction.auditLog.create({
      data: {
        eventType: AuditEventType.SCORE_ACTION,
        matchId: window.matchId,
        metadata: {
          action: 'SCORING_WINDOW_RESOLVED',
          scoreAwarded: winningColor !== null,
          scoringWindowId: window.id,
          votes: votes.map((vote) => ({
            athlete: vote.athleteColor,
            refereeSlot: vote.refereeSlot,
            serverReceivedAt: vote.serverReceivedAt.toISOString(),
          })),
          winningColor,
        },
      },
      select: { id: true },
    });

    return {
      matchId: window.matchId,
      payload: {
        matchPublicId,
        votes: votes.map((vote) => ({
          athlete: this.sharedAthleteColor(vote.athleteColor),
          refereeSlot: this.sharedRefereeSlot(vote.refereeSlot),
          serverReceivedAt: vote.serverReceivedAt.toISOString(),
        })),
        window: {
          endsAt: window.endsAt.toISOString(),
          id: window.id,
          resolvedAt: resolvedAt.toISOString(),
          roundNumber: this.roundNumber(window.roundNumber),
          scoreAwarded: winningColor !== null,
          startedAt: window.startedAt.toISOString(),
          winningColor:
            winningColor === null
              ? null
              : this.sharedAthleteColor(winningColor),
        },
      },
      scoreUpdated,
    };
  }

  private async scoreUpdatedPayload(
    transaction: Prisma.TransactionClient,
    matchId: string,
    matchPublicId: string,
    scoringWindowId: string,
    updatedAt: Date,
  ): Promise<ScoreUpdatedPayload> {
    const [athletes, totals] = await Promise.all([
      transaction.matchAthlete.findMany({
        orderBy: { color: 'asc' },
        select: { color: true, id: true },
        where: { matchId },
      }),
      transaction.scoreEvent.groupBy({
        _sum: { value: true },
        by: ['athleteId'],
        where: { matchId, revertedAt: null },
      }),
    ]);
    const totalsByAthlete = new Map(
      totals.map((total) => [total.athleteId, total._sum.value ?? 0]),
    );
    return {
      matchPublicId,
      scores: athletes.map((athlete) => ({
        athleteId: athlete.id,
        color: this.sharedAthleteColor(athlete.color),
        score: totalsByAthlete.get(athlete.id) ?? 0,
      })),
      penaltyId: null,
      scoringWindowId,
      updatedAt: updatedAt.toISOString(),
    };
  }

  private activeRound(match: {
    currentRound: number | null;
    rounds: ActiveRound[];
    status: MatchStatus;
  }): ActiveRound | null {
    if (
      match.status !== MatchStatus.ROUND_1_RUNNING &&
      match.status !== MatchStatus.ROUND_2_RUNNING
    ) {
      return null;
    }
    const expectedRound = match.status === MatchStatus.ROUND_1_RUNNING ? 1 : 2;
    if (match.currentRound !== expectedRound) {
      return null;
    }
    return (
      match.rounds.find((round) => round.roundNumber === expectedRound) ?? null
    );
  }

  private acceptedPayload(
    athlete: AthleteColor,
    matchPublicId: string,
    refereeSlot: RefereeSlot,
    scoringWindowId: string,
    serverReceivedAt: Date,
  ): VoteAcceptedPayload {
    return {
      athlete: this.sharedAthleteColor(athlete),
      matchPublicId,
      refereeSlot: this.sharedRefereeSlot(refereeSlot),
      scoringWindowId,
      serverReceivedAt: serverReceivedAt.toISOString(),
    };
  }

  private async lockMatch(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT "id" FROM "matches" WHERE "id" = ${matchId}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new Error('Match not found while acquiring scoring lock');
    }
  }

  private async rulesForMatch(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ) {
    const match = await transaction.match.findUniqueOrThrow({
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

  private async lockActiveRefereeSession(
    transaction: Prisma.TransactionClient,
    matchId: string,
    sessionId: string,
    refereeSlot: RefereeSlot,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT match_session."id"
      FROM "match_sessions" AS match_session
      INNER JOIN "match_access_codes" AS access_code
        ON access_code."id" = match_session."access_code_id"
      WHERE match_session."id" = ${sessionId}::uuid
        AND match_session."match_id" = ${matchId}::uuid
        AND match_session."active" = true
        AND match_session."revoked_at" IS NULL
        AND match_session."expires_at" > clock_timestamp()
        AND match_session."role" = 'REFEREE'
        AND match_session."referee_slot" = ${refereeSlot}::"referee_slot"
        AND access_code."access_role" = ${refereeSlot}::text::"match_access_role"
      FOR UPDATE OF match_session
    `;
    if (rows.length !== 1) {
      throw new InactiveVoteSessionError();
    }
  }

  private async serverClock(
    transaction: Prisma.TransactionClient,
  ): Promise<ServerClock> {
    const rows = await transaction.$queryRaw<ServerClock[]>`
      SELECT clock_timestamp() AS "serverNow"
    `;
    const clock = rows[0];
    if (clock === undefined) {
      throw new Error('Database server clock was unavailable');
    }
    return clock;
  }

  private scheduleResolution(
    matchId: string,
    windowId: string,
    endsAt: Date,
    serverNow: Date,
  ): void {
    this.scheduleResolutionAfter(
      matchId,
      windowId,
      endsAt.getTime() - serverNow.getTime(),
    );
  }

  private scheduleResolutionAfter(
    matchId: string,
    windowId: string,
    delayMs: number,
  ): void {
    if (this.shuttingDown) {
      return;
    }
    this.cancelResolution(windowId);
    const timer = setTimeout(
      () => {
        this.scheduledResolutions.delete(windowId);
        void this.handleResolution(matchId, windowId).catch(
          (error: unknown) => {
            this.logger.error(
              { error, matchId, windowId },
              'Unable to process scheduled scoring resolution',
            );
            if (!this.shuttingDown) {
              this.scheduleResolutionAfter(
                matchId,
                windowId,
                RESOLUTION_RETRY_DELAY_MS,
              );
            }
          },
        );
      },
      Math.max(0, Math.min(delayMs, MAX_TIMEOUT_MS)),
    );
    timer.unref();
    this.scheduledResolutions.set(windowId, { timer });
  }

  private cancelResolution(windowId: string): void {
    const scheduled = this.scheduledResolutions.get(windowId);
    if (scheduled === undefined) {
      return;
    }
    clearTimeout(scheduled.timer);
    this.scheduledResolutions.delete(windowId);
  }

  private roundNumber(roundNumber: number): 1 | 2 {
    if (roundNumber === 1 || roundNumber === 2) {
      return roundNumber;
    }
    throw new Error(`Unsupported scoring round number: ${String(roundNumber)}`);
  }

  private sharedAthleteColor(color: AthleteColor): SharedAthleteColor {
    return color === AthleteColor.RED
      ? SharedAthleteColor.RED
      : SharedAthleteColor.BLUE;
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
}
