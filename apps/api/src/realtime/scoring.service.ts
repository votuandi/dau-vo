import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  AthleteColor as SharedAthleteColor,
  type ScoreUpdatedPayload,
  type ScoringWindowOpenedPayload,
  type ScoringWindowResolvedPayload,
  type VoteAcceptedPayload,
  JudgeSlot as SharedJudgeSlot,
} from '@martial-arts-scoring/shared-types';
import {
  AthleteColor,
  AuditEventType,
  MatchStatus,
  RoundStage,
  type JudgeSlot,
  ScoreEventType,
  ScoringMethod,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { activeRoundElapsedMs } from './round-timing';
import {
  DuplicateRefereeVoteError,
  InactiveVoteSessionError,
  MatchNotRunningForVoteError,
  PriorScoringWindowPendingError,
  RoundEndedForVoteError,
  ScoringClosedForVoteError,
} from './scoring.errors';

/** Official duration of a persisted referee voting window. */
export const SCORING_WINDOW_DURATION_MS = 1_500;

const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const RESOLUTION_RETRY_DELAY_MS = 1_000;

type VoteAuthorization =
  | {
      assignmentId: string;
      kind: 'official';
      officialSessionId: string;
      judgePosition: number;
    }
  | { kind: 'legacy'; judgeSlot: JudgeSlot; sessionId: string };

interface LockedRow {
  id: string;
  judgePosition?: number;
}

interface ServerClock {
  serverNow: Date;
}

interface ActiveRound {
  pausedAt?: Date | null;
  remainingDurationMs?: number | null;
  durationMs: number | null;
  endsAt: Date;
  id: string;
  roundNumber: number;
  stage: RoundStage;
  startedAt: Date;
}

const WINDOW_SELECT = {
  endsAt: true,
  id: true,
  matchId: true,
  roundElapsedMs: true,
  roundId: true,
  roundNumber: true,
  startedAt: true,
} as const satisfies Prisma.ScoringWindowSelect;

/** A window with a known deadline: every timed window, and a referee-command
 * window at the moment it is closed. */
interface WindowRow {
  endsAt: Date;
  id: string;
  matchId: string;
  roundElapsedMs: number | null;
  roundId: string | null;
  roundNumber: number;
  startedAt: Date;
}

/** Narrows a timed window. Only referee-command matches open windows without
 * a deadline, so meeting one in the free-window flow is a pending conflict. */
function timedWindow<T extends { endsAt: Date | null }>(
  window: T,
): T & { endsAt: Date } {
  if (window.endsAt === null) throw new PriorScoringWindowPendingError();
  return { ...window, endsAt: window.endsAt };
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
      select: { id: true, matchId: true },
      // Referee-command windows have no deadline; they close on round resume.
      where: { endsAt: { not: null }, invalidatedAt: null, resolvedAt: null },
    });

    for (const window of windows) {
      await this.handleResolution(window.matchId, window.id);
    }
  }

  /** Used by a locked round-end transaction so a voting window whose deadline
   * has already passed cannot leave a stale regulation summary behind. */
  async resolveDueWindowsLocked(
    transaction: Prisma.TransactionClient,
    matchId: string,
    matchPublicId: string,
    resolvedAt: Date,
  ): Promise<void> {
    for (;;) {
      const window = await transaction.scoringWindow.findFirst({
        orderBy: { startedAt: 'asc' },
        select: WINDOW_SELECT,
        where: {
          matchId,
          invalidatedAt: null,
          resolvedAt: null,
          endsAt: { lte: resolvedAt },
        },
      });
      if (!window) return;
      await this.resolveLockedWindow(
        transaction,
        timedWindow(window),
        resolvedAt,
        matchPublicId,
      );
    }
  }

  async submitVote(input: {
    athlete: AthleteColor;
    matchId: string;
    officialSessionId?: string;
    judgeSlot?: JudgeSlot;
    sessionId?: string;
  }): Promise<VoteSubmissionTransition> {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, input.matchId);
        await this.rulesForMatch(transaction, input.matchId);
        const authorization = input.officialSessionId
          ? await this.lockActiveJudgeAssignment(
              transaction,
              input.matchId,
              input.officialSessionId,
            )
          : await this.lockLegacyJudgeSession(
              transaction,
              input.matchId,
              input.sessionId,
              input.judgeSlot,
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
                pausedAt: true,
                remainingDurationMs: true,
                endsAt: true,
                id: true,
                roundNumber: true,
                stage: true,
                startedAt: true,
              },
              where: { endedAt: null },
            },
            scoringMethod: true,
            status: true,
          },
          where: { id: input.matchId },
        });
        const activeRound = this.activeRound(match);

        if (activeRound === null) {
          throw new MatchNotRunningForVoteError();
        }
        if (match.scoringMethod === ScoringMethod.REFEREE_COMMAND) {
          return {
            accepted: await this.recordRefereeCommandVote(transaction, {
              activeRound,
              athlete: input.athlete,
              authorization,
              matchId: input.matchId,
              matchPublicId: match.publicId,
              serverNow: clock.serverNow,
            }),
            opened: null,
            resolvedBeforeAcceptance: null,
            schedule: null,
          };
        }
        if (
          activeRound.pausedAt == null &&
          clock.serverNow.getTime() >= activeRound.endsAt.getTime()
        ) {
          throw new RoundEndedForVoteError();
        }

        const pending = await transaction.scoringWindow.findFirst({
          orderBy: { startedAt: 'asc' },
          select: WINDOW_SELECT,
          where: {
            invalidatedAt: null,
            matchId: input.matchId,
            resolvedAt: null,
          },
        });
        let unresolved = pending === null ? null : timedWindow(pending);
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
          const { endsAt } = unresolved;
          if (
            !isWithinScoringWindow(
              clock.serverNow,
              unresolved.startedAt,
              endsAt,
            )
          ) {
            throw new RoundEndedForVoteError();
          }
          const existing = await transaction.judgeVote.findFirst({
            select: { id: true },
            where: {
              scoringWindowId: unresolved.id,
              ...this.voteOwnerWhere(authorization),
            },
          });

          if (existing !== null) {
            throw new DuplicateRefereeVoteError();
          }

          const vote = await this.createVote(transaction, {
            athlete: input.athlete,
            authorization,
            matchId: input.matchId,
            scoringWindowId: unresolved.id,
            serverNow: clock.serverNow,
          });

          return {
            accepted: this.acceptedPayload(
              input.athlete,
              match.publicId,
              authorization,
              unresolved.id,
              vote.serverReceivedAt,
            ),
            opened: null,
            resolvedBeforeAcceptance,
            schedule: {
              endsAt,
              serverNow: clock.serverNow,
              windowId: unresolved.id,
            },
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
          select: { id: true, roundNumber: true, startedAt: true },
        });
        const vote = await this.createVote(transaction, {
          athlete: input.athlete,
          authorization,
          matchId: input.matchId,
          scoringWindowId: window.id,
          serverNow: clock.serverNow,
        });

        return {
          accepted: this.acceptedPayload(
            input.athlete,
            match.publicId,
            authorization,
            window.id,
            vote.serverReceivedAt,
          ),
          opened: this.openedPayload(match.publicId, { ...window, endsAt }),
          resolvedBeforeAcceptance,
          schedule: { endsAt, serverNow: clock.serverNow, windowId: window.id },
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );

    if (result.schedule !== null) {
      this.scheduleResolution(
        input.matchId,
        result.schedule.windowId,
        result.schedule.endsAt,
        result.schedule.serverNow,
      );
    }
    return {
      accepted: result.accepted,
      opened: result.opened,
      resolvedBeforeAcceptance: result.resolvedBeforeAcceptance,
    };
  }

  /**
   * Opens a referee-command window for a round the caller has just paused
   * inside the same Match-locked transaction. The window has no deadline: it
   * stays open until {@link resolveRefereeCommandWindowLocked} closes it.
   */
  async openRefereeCommandWindowLocked(
    transaction: Prisma.TransactionClient,
    input: {
      matchId: string;
      matchPublicId: string;
      round: ActiveRound;
      serverNow: Date;
    },
  ): Promise<ScoringWindowOpenedPayload> {
    // A window invalidated while open (result cancellation, match exit) never
    // counts, but still occupies the one-unresolved-window-per-match index.
    await transaction.scoringWindow.updateMany({
      data: { endsAt: input.serverNow, resolvedAt: input.serverNow },
      where: {
        endsAt: null,
        invalidatedAt: { not: null },
        matchId: input.matchId,
        resolvedAt: null,
      },
    });
    const window = await transaction.scoringWindow.create({
      data: {
        endsAt: null,
        matchId: input.matchId,
        roundElapsedMs: activeRoundElapsedMs(input.round, input.serverNow),
        roundId: input.round.id,
        roundNumber: input.round.roundNumber,
        startedAt: input.serverNow,
      },
      select: { id: true, roundNumber: true, startedAt: true },
    });
    return this.openedPayload(input.matchPublicId, { ...window, endsAt: null });
  }

  /**
   * Closes the open referee-command window, if any, at `resolvedAt` and
   * awards the point under the usual judge-majority rule. Must run inside a
   * transaction that already holds the Match row lock.
   */
  async resolveRefereeCommandWindowLocked(
    transaction: Prisma.TransactionClient,
    matchId: string,
    matchPublicId: string,
    resolvedAt: Date,
  ): Promise<ScoringResolutionTransition | null> {
    const window = await transaction.scoringWindow.findFirst({
      select: WINDOW_SELECT,
      where: { endsAt: null, invalidatedAt: null, matchId, resolvedAt: null },
    });
    if (window === null) return null;
    return this.resolveLockedWindow(
      transaction,
      { ...window, endsAt: resolvedAt },
      resolvedAt,
      matchPublicId,
    );
  }

  private async recordRefereeCommandVote(
    transaction: Prisma.TransactionClient,
    input: {
      activeRound: ActiveRound;
      athlete: AthleteColor;
      authorization: VoteAuthorization;
      matchId: string;
      matchPublicId: string;
      serverNow: Date;
    },
  ): Promise<VoteAcceptedPayload> {
    const window = await transaction.scoringWindow.findFirst({
      select: { id: true },
      where: {
        endsAt: null,
        invalidatedAt: null,
        matchId: input.matchId,
        resolvedAt: null,
        roundId: input.activeRound.id,
      },
    });
    if (input.activeRound.pausedAt == null || window === null) {
      throw new ScoringClosedForVoteError();
    }
    const existing = await transaction.judgeVote.findFirst({
      select: { id: true },
      where: {
        scoringWindowId: window.id,
        ...this.voteOwnerWhere(input.authorization),
      },
    });
    // A judge may change their choice while scoring is open; the last choice
    // before the supervisor resumes the round is the one that counts.
    const vote =
      existing === null
        ? await this.createVote(transaction, {
            athlete: input.athlete,
            authorization: input.authorization,
            matchId: input.matchId,
            scoringWindowId: window.id,
            serverNow: input.serverNow,
          })
        : await transaction.judgeVote.update({
            data: {
              athleteColor: input.athlete,
              serverReceivedAt: input.serverNow,
            },
            select: { serverReceivedAt: true },
            where: { id: existing.id },
          });
    return this.acceptedPayload(
      input.athlete,
      input.matchPublicId,
      input.authorization,
      window.id,
      vote.serverReceivedAt,
    );
  }

  private voteOwnerWhere(
    authorization: VoteAuthorization,
  ): Prisma.JudgeVoteWhereInput {
    return authorization.kind === 'official'
      ? { assignmentId: authorization.assignmentId }
      : { assignmentId: null, judgeSlot: authorization.judgeSlot };
  }

  private createVote(
    transaction: Prisma.TransactionClient,
    input: {
      athlete: AthleteColor;
      authorization: VoteAuthorization;
      matchId: string;
      scoringWindowId: string;
      serverNow: Date;
    },
  ): Promise<{ serverReceivedAt: Date }> {
    const { authorization } = input;
    return transaction.judgeVote.create({
      data: {
        athleteColor: input.athlete,
        matchId: input.matchId,
        assignmentId:
          authorization.kind === 'official' ? authorization.assignmentId : null,
        judgeSlot:
          authorization.kind === 'legacy' ? authorization.judgeSlot : null,
        scoringWindowId: input.scoringWindowId,
        serverReceivedAt: input.serverNow,
        sessionId:
          authorization.kind === 'legacy' ? authorization.sessionId : null,
      },
      select: { serverReceivedAt: true },
    });
  }

  private openedPayload(
    matchPublicId: string,
    window: {
      endsAt: Date | null;
      id: string;
      roundNumber: number;
      startedAt: Date;
    },
  ): ScoringWindowOpenedPayload {
    return {
      matchPublicId,
      window: {
        endsAt: window.endsAt?.toISOString() ?? null,
        id: window.id,
        roundNumber: this.roundNumber(window.roundNumber),
        startedAt: window.startedAt.toISOString(),
      },
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
            select: WINDOW_SELECT,
            where: {
              endsAt: { not: null },
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
        const timed = timedWindow(window);
        const delayMs = timed.endsAt.getTime() - clock.serverNow.getTime();
        if (delayMs > 0) {
          return { delayMs, kind: 'pending' };
        }
        return {
          kind: 'resolved',
          transition: await this.resolveLockedWindow(
            transaction,
            timed,
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
    const match = await transaction.match.findUniqueOrThrow({
      where: { id: window.matchId },
      select: { requiredJudgeCount: true },
    });
    const votes = await transaction.judgeVote.findMany({
      orderBy: { serverReceivedAt: 'asc' },
      select: {
        assignmentId: true,
        athleteColor: true,
        judgeSlot: true,
        serverReceivedAt: true,
        assignment: { select: { judgePosition: true } },
      },
      where: { scoringWindowId: window.id },
    });
    const redVotes = votes.filter(
      (vote) => vote.athleteColor === AthleteColor.RED,
    ).length;
    const blueVotes = votes.filter(
      (vote) => vote.athleteColor === AthleteColor.BLUE,
    ).length;
    const winningColor =
      redVotes >= rules.judgeMajority(match.requiredJudgeCount)
        ? AthleteColor.RED
        : blueVotes >= rules.judgeMajority(match.requiredJudgeCount)
          ? AthleteColor.BLUE
          : null;

    const updated = await transaction.scoringWindow.updateMany({
      data: {
        // A referee-command window gets its end recorded as it closes.
        endsAt: window.endsAt,
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
          type: ScoreEventType.JUDGE_POINT,
          value: rules.judgePointValue,
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
            assignmentId: vote.assignmentId,
            judgePosition: vote.assignment?.judgePosition ?? null,
            judgeSlot:
              vote.judgeSlot === null
                ? null
                : this.sharedJudgeSlot(vote.judgeSlot),
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
          assignmentId: vote.assignmentId,
          judgePosition: vote.assignment?.judgePosition ?? null,
          judgeSlot:
            vote.judgeSlot === null
              ? null
              : this.sharedJudgeSlot(vote.judgeSlot),
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
      match.status !== MatchStatus.ROUND_2_RUNNING &&
      match.status !== MatchStatus.OVERTIME_RUNNING &&
      match.status !== MatchStatus.ROUND_1_PAUSED &&
      match.status !== MatchStatus.ROUND_2_PAUSED &&
      match.status !== MatchStatus.OVERTIME_PAUSED
    ) {
      return null;
    }
    const expectedRound =
      match.status === MatchStatus.ROUND_1_RUNNING ||
      match.status === MatchStatus.ROUND_1_PAUSED
        ? 1
        : match.status === MatchStatus.ROUND_2_RUNNING ||
            match.status === MatchStatus.ROUND_2_PAUSED
          ? match.currentRound
          : 1;
    if (match.currentRound !== expectedRound) {
      return null;
    }
    return (
      match.rounds.find(
        (round) =>
          round.roundNumber === expectedRound &&
          (match.status === MatchStatus.OVERTIME_RUNNING ||
          match.status === MatchStatus.OVERTIME_PAUSED
            ? round.stage === RoundStage.OVERTIME
            : round.stage === RoundStage.REGULATION),
      ) ?? null
    );
  }

  private acceptedPayload(
    athlete: AthleteColor,
    matchPublicId: string,
    authorization: VoteAuthorization,
    scoringWindowId: string,
    serverReceivedAt: Date,
  ): VoteAcceptedPayload {
    if (authorization.kind === 'official') {
      return {
        athlete: this.sharedAthleteColor(athlete),
        identity: {
          assignmentId: authorization.assignmentId,
          kind: 'official',
          judgePosition: authorization.judgePosition,
        },
        matchPublicId,
        scoringWindowId,
        serverReceivedAt: serverReceivedAt.toISOString(),
      };
    }
    return {
      athlete: this.sharedAthleteColor(athlete),
      identity: {
        kind: 'legacy',
        judgeSlot: this.sharedJudgeSlot(authorization.judgeSlot),
      },
      matchPublicId,
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

  private async lockActiveJudgeAssignment(
    transaction: Prisma.TransactionClient,
    matchId: string,
    officialSessionId: string,
  ): Promise<VoteAuthorization> {
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT assignment."id", assignment."judge_position" AS "judgePosition"
      FROM "tournament_official_sessions" AS official_session
      INNER JOIN "match_official_assignments" AS assignment
        ON assignment."official_id" = official_session."official_id"
      INNER JOIN "tournament_officials" AS official
        ON official."id" = official_session."official_id"
      INNER JOIN "matches" AS match
        ON match."id" = assignment."match_id"
      WHERE official_session."id" = ${officialSessionId}::uuid
        AND official_session."active" = true AND official_session."revoked_at" IS NULL
        AND official_session."expires_at" > clock_timestamp()
        AND assignment."match_id" = ${matchId}::uuid AND assignment."role" = 'JUDGE'
        AND assignment."released_at" IS NULL
        AND assignment."tournament_id" = match."tournament_id"
        AND official."tournament_id" = match."tournament_id"
      FOR UPDATE OF official_session, assignment
    `;
    const row = rows[0];
    if (rows.length !== 1 || row?.judgePosition === undefined) {
      throw new InactiveVoteSessionError();
    }
    return {
      assignmentId: row.id,
      kind: 'official',
      officialSessionId,
      judgePosition: row.judgePosition,
    };
  }

  private async lockLegacyJudgeSession(
    transaction: Prisma.TransactionClient,
    matchId: string,
    sessionId: string | undefined,
    judgeSlot: JudgeSlot | undefined,
  ): Promise<VoteAuthorization> {
    if (!sessionId || !judgeSlot) throw new InactiveVoteSessionError();
    const lockedSessionId = await this.lockActiveJudgeSession(
      transaction,
      matchId,
      sessionId,
      judgeSlot,
    );
    return {
      kind: 'legacy',
      judgeSlot,
      sessionId: lockedSessionId,
    };
  }

  private async lockActiveJudgeSession(
    transaction: Prisma.TransactionClient,
    matchId: string,
    sessionId: string,
    judgeSlot: JudgeSlot,
  ): Promise<string> {
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT match_session."id" FROM "match_sessions" AS match_session
      WHERE match_session."id" = ${sessionId}::uuid AND match_session."match_id" = ${matchId}::uuid
      AND match_session."active" = true AND match_session."revoked_at" IS NULL
      AND match_session."expires_at" > clock_timestamp() AND match_session."role" = 'JUDGE'
      AND match_session."judge_slot" = ${judgeSlot}::"judge_slot" FOR UPDATE`;
    if (rows.length !== 1) throw new InactiveVoteSessionError();
    return rows[0]!.id;
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

  private roundNumber(roundNumber: number): number {
    if (
      Number.isInteger(roundNumber) &&
      roundNumber >= 1 &&
      roundNumber <= 20
    ) {
      return roundNumber;
    }
    throw new Error(`Unsupported scoring round number: ${String(roundNumber)}`);
  }

  private sharedAthleteColor(color: AthleteColor): SharedAthleteColor {
    return color === AthleteColor.RED
      ? SharedAthleteColor.RED
      : SharedAthleteColor.BLUE;
  }

  private sharedJudgeSlot(slot: JudgeSlot): SharedJudgeSlot {
    switch (slot) {
      case 'JUDGE_1':
        return SharedJudgeSlot.JUDGE_1;
      case 'JUDGE_2':
        return SharedJudgeSlot.JUDGE_2;
      case 'JUDGE_3':
        return SharedJudgeSlot.JUDGE_3;
    }
  }
}
