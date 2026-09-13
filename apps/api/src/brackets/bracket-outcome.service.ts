import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  AuditEventType,
  BracketFixtureStatus,
  BracketStatus,
  MatchStatus,
} from '@prisma/client';
import { Prisma, type AthleteColor } from '@prisma/client';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';

export class BracketProgressionLockedError extends Error {
  constructor() {
    super('The next bracket match has already been prepared');
    this.name = BracketProgressionLockedError.name;
  }
}

/** Authoritative, transaction-scoped result decision and single-elimination propagation. */
@Injectable()
export class BracketOutcomeService {
  constructor(
    @Inject(SportRulesRegistry) private readonly rules: SportRulesRegistry,
  ) {}

  async processFinishedMatch(tx: Prisma.TransactionClient, matchId: string) {
    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        tournament: { include: { sport: { include: { sportGroup: true } } } },
        athletes: true,
      },
    });
    if (match.status !== MatchStatus.FINISHED) return null;
    const totals: Record<AthleteColor, number> = { RED: 0, BLUE: 0 };
    const events = await tx.scoreEvent.findMany({
      where: { matchId, revertedAt: null },
      include: { athlete: { select: { color: true } } },
    });
    for (const event of events) totals[event.athlete.color] += event.value;
    const snapshot = {
      effectiveTotals: totals,
      evaluatedAt: new Date().toISOString(),
      eventCount: events.length,
    };
    const winnerColor = this.rules
      .resolve(match.tournament.sport.sportGroup.code)
      .determineWinner(totals);
    if (!match.bracketFixtureId) return { snapshot, winnerColor };
    await this.lockFixtureAndDownstream(tx, match.bracketFixtureId);
    const fixture = await tx.bracketFixture.findUniqueOrThrow({
      where: { id: match.bracketFixtureId },
      include: { bracket: true, slots: true },
    });
    if (
      fixture.winnerEntrantId ||
      fixture.status === BracketFixtureStatus.AWAITING_WINNER
    )
      return { snapshot, winnerColor };
    if (winnerColor === null) {
      await tx.bracketFixture.update({
        where: { id: fixture.id },
        data: {
          status: BracketFixtureStatus.AWAITING_WINNER,
          winnerDecision: {
            decisionType: 'RULES_TIE',
            scoreSnapshot: snapshot,
          },
        },
      });
      return { snapshot, winnerColor: null };
    }
    const winnerAthlete = match.athletes.find((a) => a.color === winnerColor);
    const entrants = await tx.bracketEntrant.findMany({
      where: {
        id: {
          in: fixture.slots.flatMap((s) =>
            s.resolvedEntrantId ? [s.resolvedEntrantId] : [],
          ),
        },
      },
    });
    const winnerAthleteId = winnerAthlete?.athleteId;
    const winner = fixture.slots.find(
      (s) =>
        s.resolvedEntrantId !== null &&
        winnerAthleteId !== null &&
        entrants.some(
          (e) =>
            e.id === s.resolvedEntrantId && e.athleteId === winnerAthleteId,
        ),
    );
    if (!winner?.resolvedEntrantId)
      throw new ConflictException({
        code: 'BRACKET_WINNER_DECISION_INVALID',
        message: 'Match athlete is not a fixture participant',
      });
    return this.decide(tx, fixture.id, winner.resolvedEntrantId, {
      decisionType: 'RULES',
      scoreSnapshot: snapshot,
    });
  }

  /**
   * Retracts only a propagated decision.  We deliberately never remove an
   * operational downstream Match: access credentials and its audit trail are
   * immutable once preparation has begun.
   */
  async retractFinishedMatch(
    tx: Prisma.TransactionClient,
    matchId: string,
    actor: { sessionId?: string; adminUserId?: string; reason: string },
  ): Promise<void> {
    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { bracketFixtureId: true },
    });
    if (!match.bracketFixtureId) return;
    await this.lockFixtureAndDownstream(tx, match.bracketFixtureId);
    const fixture = await tx.bracketFixture.findUniqueOrThrow({
      where: { id: match.bracketFixtureId },
      include: {
        bracket: true,
        sourceSlots: {
          include: { fixture: { include: { match: true, slots: true } } },
        },
      },
    });
    if (!fixture.winnerEntrantId) return;
    const downstreamSlots = fixture.sourceSlots;
    const prepared = downstreamSlots.find(
      (slot) => slot.fixture.match !== null,
    );
    if (prepared) {
      throw new BracketProgressionLockedError();
    }
    const previous = {
      status: fixture.status,
      winnerEntrantId: fixture.winnerEntrantId,
      winnerDecision: fixture.winnerDecision,
    };
    await tx.bracketFixture.update({
      where: { id: fixture.id },
      data: {
        winnerEntrantId: null,
        winnerDecision: Prisma.JsonNull,
        status: BracketFixtureStatus.MATCH_PREPARED,
      },
    });
    for (const slot of downstreamSlots) {
      await tx.bracketSlot.update({
        where: { id: slot.id },
        data: { resolvedEntrantId: null },
      });
      const slots = await tx.bracketSlot.findMany({
        where: { fixtureId: slot.fixtureId },
      });
      if (!slots.every((item) => item.resolvedEntrantId)) {
        await tx.bracketFixture.update({
          where: { id: slot.fixtureId },
          data: { status: BracketFixtureStatus.PENDING_PARTICIPANTS },
        });
      }
    }
    if (fixture.roundNumber === fixture.bracket.roundCount) {
      await tx.tournamentBracket.update({
        where: { id: fixture.bracketId },
        data: {
          status: BracketStatus.ACTIVE,
          completedAt: null,
          championEntrantId: null,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        eventType: AuditEventType.BRACKET_WINNER_RETRACTED,
        matchId,
        ...(actor.sessionId ? { sessionId: actor.sessionId } : {}),
        ...(actor.adminUserId ? { adminUserId: actor.adminUserId } : {}),
        metadata: {
          action: actor.reason,
          fixtureId: fixture.id,
          previousState: previous,
          nextState: {
            status: BracketFixtureStatus.MATCH_PREPARED,
            winnerEntrantId: null,
          },
        },
      },
    });
  }

  async manuallyDecide(
    tx: Prisma.TransactionClient,
    fixtureId: string,
    entrantId: string,
    actorId: string,
    reason: string,
    idempotencyKey: string,
  ) {
    const existing = await tx.bracketWinnerDecisionIdempotency.findUnique({
      where: { fixtureId_key: { fixtureId, key: idempotencyKey } },
    });
    if (existing) {
      if (existing.entrantId !== entrantId)
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: 'Idempotency key was used for another entrant',
        });
      return existing.response;
    }
    const fixture = await tx.bracketFixture.findUniqueOrThrow({
      where: { id: fixtureId },
      include: { match: true, slots: true },
    });
    if (
      fixture.match?.status !== MatchStatus.FINISHED ||
      fixture.status !== BracketFixtureStatus.AWAITING_WINNER
    )
      throw new ConflictException({
        code: 'BRACKET_TIE_DECISION_REQUIRED',
        message: 'Fixture is not awaiting a winner decision',
      });
    if (!fixture.slots.some((s) => s.resolvedEntrantId === entrantId))
      throw new ConflictException({
        code: 'BRACKET_WINNER_DECISION_INVALID',
        message: 'Selected entrant is not a fixture participant',
      });
    const priorDecision = fixture.winnerDecision as {
      scoreSnapshot?: unknown;
    } | null;
    const result = await this.decide(tx, fixtureId, entrantId, {
      actorId,
      decisionType: 'ADMIN_TIEBREAK',
      reason,
      scoreSnapshot: priorDecision?.scoreSnapshot ?? null,
    });
    await tx.bracketWinnerDecisionIdempotency.create({
      data: {
        fixtureId,
        key: idempotencyKey,
        entrantId,
        response: result as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  private async decide(
    tx: Prisma.TransactionClient,
    fixtureId: string,
    entrantId: string,
    decision: Record<string, unknown>,
  ) {
    await this.lockFixtureAndDownstream(tx, fixtureId);
    const fixture = await tx.bracketFixture.findUniqueOrThrow({
      where: { id: fixtureId },
      include: { bracket: true },
    });
    if (fixture.winnerEntrantId) {
      if (fixture.winnerEntrantId !== entrantId)
        throw new ConflictException({
          code: 'BRACKET_WINNER_DECISION_CONFLICT',
          message: 'Fixture already has another winner',
        });
      return {
        fixtureId,
        winnerEntrantId: entrantId,
        bracketId: fixture.bracketId,
      };
    }
    await tx.bracketFixture.update({
      where: { id: fixtureId },
      data: {
        winnerEntrantId: entrantId,
        status: BracketFixtureStatus.COMPLETED,
        winnerDecision: decision as Prisma.InputJsonValue,
      },
    });
    const downstream = await tx.bracketSlot.findMany({
      where: { sourceFixtureId: fixtureId },
      include: { fixture: { include: { slots: true } } },
    });
    for (const slot of downstream) {
      if (slot.resolvedEntrantId && slot.resolvedEntrantId !== entrantId)
        throw new ConflictException({
          code: 'BRACKET_WINNER_DECISION_CONFLICT',
          message: 'Downstream slot already differs',
        });
      if (!slot.resolvedEntrantId)
        await tx.bracketSlot.update({
          where: { id: slot.id },
          data: { resolvedEntrantId: entrantId },
        });
      const slots = await tx.bracketSlot.findMany({
        where: { fixtureId: slot.fixtureId },
      });
      if (slots.every((s) => s.resolvedEntrantId))
        await tx.bracketFixture.updateMany({
          where: {
            id: slot.fixtureId,
            status: BracketFixtureStatus.PENDING_PARTICIPANTS,
          },
          data: { status: BracketFixtureStatus.READY },
        });
    }
    if (fixture.roundNumber === fixture.bracket.roundCount) {
      await tx.tournamentBracket.update({
        where: { id: fixture.bracketId },
        data: {
          status: BracketStatus.COMPLETED,
          completedAt: new Date(),
          championEntrantId: entrantId,
        },
      });
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.BRACKET_COMPLETED,
          metadata: {
            bracketId: fixture.bracketId,
            tournamentId: fixture.bracket.tournamentId,
            weightClassId: fixture.bracket.weightClassId,
            championEntrantId: entrantId,
          },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        eventType:
          decision.decisionType === 'ADMIN_TIEBREAK'
            ? AuditEventType.BRACKET_WINNER_MANUALLY_DECIDED
            : AuditEventType.BRACKET_WINNER_ADVANCED,
        metadata: { fixtureId, entrantId, ...decision },
      },
    });
    return {
      fixtureId,
      winnerEntrantId: entrantId,
      bracketId: fixture.bracketId,
    };
  }

  // All outcome paths lock fixture rows in lexical UUID order.  This same
  // order is used for propagation, retraction, and concurrent preparation.
  private async lockFixtureAndDownstream(
    tx: Prisma.TransactionClient,
    fixtureId: string,
  ) {
    const downstream = await tx.bracketSlot.findMany({
      where: { sourceFixtureId: fixtureId },
      select: { fixtureId: true },
    });
    const ids = [fixtureId, ...downstream.map((slot) => slot.fixtureId)].sort();
    await tx.$queryRaw`
      SELECT id FROM bracket_fixtures
      WHERE id = ANY(${ids}::uuid[])
      ORDER BY id FOR UPDATE
    `;
  }
}
