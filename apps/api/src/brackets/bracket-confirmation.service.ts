import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AuditEventType,
  BracketFixtureStatus,
  BracketStatus,
  Prisma,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BracketPreviewService } from './bracket-preview.service';
import {
  BracketPreviewTokenService,
  type BracketPreviewTokenClaims,
} from './bracket-preview-token.service';
import type { ConfirmBracketDto } from './dto/confirm-bracket.dto';
import {
  buildSingleEliminationBracket,
  type GeneratedSingleEliminationBracket,
} from './single-elimination-bracket.generator';

const fail = (code: string, message: string) =>
  new ConflictException({ code, message });

const bracketInclude = {
  championEntrant: true,
  entrants: {
    orderBy: [
      { initialRoundNumber: 'asc' },
      { initialFixturePosition: 'asc' },
      { initialSide: 'asc' },
    ],
  },
  fixtures: {
    orderBy: [{ roundNumber: 'asc' }, { position: 'asc' }],
    include: {
      slots: {
        orderBy: { side: 'asc' },
        include: { directEntrant: true, resolvedEntrant: true },
      },
      match: { select: { id: true, publicId: true, status: true } },
      winnerEntrant: true,
    },
  },
} satisfies Prisma.TournamentBracketInclude;

type BracketViewRecord = Prisma.TournamentBracketGetPayload<{
  include: typeof bracketInclude;
}>;

@Injectable()
export class BracketConfirmationService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(BracketPreviewService)
    private readonly previews: BracketPreviewService,
    @Inject(BracketPreviewTokenService)
    private readonly tokens: BracketPreviewTokenService,
  ) {}

  async confirm(
    tournamentId: string,
    weightClassId: string,
    input: ConfirmBracketDto,
    userId: string,
  ) {
    let claims: BracketPreviewTokenClaims;
    try {
      claims = this.tokens.verify(input.previewToken, {
        tournamentId,
        weightClassId,
      });
    } catch (e) {
      const code =
        e instanceof Error && e.message === 'BRACKET_PREVIEW_EXPIRED'
          ? e.message
          : 'BRACKET_PREVIEW_INVALID';
      throw fail(
        code,
        code === 'BRACKET_PREVIEW_EXPIRED'
          ? 'Bracket preview has expired'
          : 'Bracket preview is invalid',
      );
    }
    const fingerprint = this.fingerprint(claims);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM tournament_weight_classes WHERE id = ${weightClassId}::uuid AND tournament_id = ${tournamentId}::uuid FOR UPDATE`;
        const existing = await tx.tournamentBracket.findUnique({
          where: { confirmationKey: input.idempotencyKey },
          include: bracketInclude,
        });
        if (existing) {
          if (existing.confirmationFingerprint !== fingerprint)
            throw fail(
              'BRACKET_CONFIRMATION_KEY_REUSED',
              'Idempotency key was used for a different confirmation',
            );
          return this.view(existing);
        }
        const tournament = await tx.tournament.findUnique({
          where: { id: tournamentId },
          select: { status: true },
        });
        if (!tournament)
          throw new NotFoundException({
            code: 'TOURNAMENT_NOT_FOUND',
            message: 'Tournament not found',
          });
        if (tournament.status === TournamentStatus.ARCHIVED)
          throw fail('TOURNAMENT_ARCHIVED', 'Tournament is archived');
        const weight = await tx.tournamentWeightClass.findFirst({
          where: { id: weightClassId, tournamentId, isActive: true },
        });
        if (!weight)
          throw new NotFoundException({
            code: 'WEIGHT_CLASS_NOT_FOUND',
            message: 'Weight class not found',
          });
        if (
          await tx.tournamentBracket.findFirst({
            where: {
              tournamentId,
              weightClassId,
              status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
            },
          })
        )
          throw fail(
            'BRACKET_ALREADY_EXISTS',
            'A current bracket already exists for this weight class',
          );
        const athletes = await tx.tournamentAthlete.findMany({
          where: {
            tournamentId,
            weightClassId,
            isActive: true,
            weightClass: { isActive: true },
            OR: [
              { organizationId: null },
              { organization: { isActive: true } },
            ],
          },
          orderBy: { id: 'asc' },
          include: {
            organization: {
              select: { id: true, name: true, isActive: true, updatedAt: true },
            },
          },
        });
        if (
          this.previews.rosterFingerprint(athletes) !== claims.rosterFingerprint
        )
          throw fail(
            'BRACKET_ROSTER_CHANGED',
            'The eligible roster changed after preview',
          );
        const graph = this.graph(claims, new Set(athletes.map((a) => a.id)));
        const byId = new Map(athletes.map((a) => [a.id, a]));
        const openingByAthleteId = new Map(
          graph.fixtures.flatMap((fixture) =>
            fixture.slots.flatMap((slot) =>
              slot.source.kind === 'ENTRANT'
                ? [[slot.source.entrantId, fixture] as const]
                : [],
            ),
          ),
        );
        const bracket = await tx.tournamentBracket.create({
          data: {
            tournamentId,
            weightClassId,
            athleteCount: athletes.length,
            bracketSize: claims.placements.length,
            roundCount: graph.roundCount,
            confirmationKey: input.idempotencyKey,
            confirmationFingerprint: fingerprint,
            confirmedByUserId: userId,
            entrants: {
              create: claims.placements
                .filter((p) => p.athleteId)
                .map((p) => {
                  const a = byId.get(p.athleteId!)!;
                  const at = openingByAthleteId.get(p.athleteId!)!;
                  const paired =
                    claims.placements[
                      p.drawPosition % 2 === 0
                        ? p.drawPosition - 2
                        : p.drawPosition
                    ];
                  return {
                    athleteId: a.id,
                    snapshotName: a.name,
                    snapshotBirthYear: a.birthYear,
                    snapshotOrganization: a.organization?.name ?? null,
                    snapshotImagePath: a.imagePath,
                    initialRoundNumber: at.roundNumber,
                    initialFixturePosition: at.position,
                    initialSide: at.slots.find(
                      (slot) =>
                        slot.source.kind === 'ENTRANT' &&
                        slot.source.entrantId === p.athleteId,
                    )!.side,
                    receivedBye: paired?.athleteId === null,
                  };
                }),
            },
          },
          include: { entrants: true },
        });
        const entrants = new Map(
          bracket.entrants.map((e) => [e.athleteId, e.id]),
        );
        const fixtureIds = new Map<string, string>();
        for (const f of graph.fixtures) {
          const slots = f.slots.map((s) => ({
            side: s.side,
            directEntrantId:
              s.source.kind === 'ENTRANT'
                ? entrants.get(s.source.entrantId)!
                : null,
            sourceFixtureId:
              s.source.kind === 'FIXTURE_WINNER'
                ? fixtureIds.get(s.source.fixtureId)!
                : null,
            resolvedEntrantId:
              s.source.kind === 'ENTRANT'
                ? entrants.get(s.resolvedEntrantId!)!
                : null,
          }));
          const row = await tx.bracketFixture.create({
            data: {
              bracketId: bracket.id,
              roundNumber: f.roundNumber,
              position: f.position,
              displayReference: f.displayReference,
              status: slots.every((s) => s.resolvedEntrantId)
                ? BracketFixtureStatus.READY
                : BracketFixtureStatus.PENDING_PARTICIPANTS,
              slots: { create: slots },
            },
          });
          fixtureIds.set(f.id, row.id);
        }
        await tx.auditLog.create({
          data: {
            adminUserId: userId,
            eventType: AuditEventType.BRACKET_CONFIRMED,
            metadata: {
              athleteCount: athletes.length,
              bracketId: bracket.id,
              bracketSize: claims.placements.length,
              roundCount: graph.roundCount,
              tournamentId,
              weightClassId,
            },
          },
        });
        return this.get(tx, bracket.id);
      });
    } catch (e) {
      if (this.isConfirmationKeyConflict(e)) {
        // A concurrent transaction may have committed this exact logical
        // request after our initial lookup. Replay it, never create/audit again.
        const winner = await this.prisma.tournamentBracket.findUnique({
          where: { confirmationKey: input.idempotencyKey },
          include: bracketInclude,
        });
        if (winner) {
          if (winner.confirmationFingerprint === fingerprint)
            return this.view(winner);
          throw fail(
            'BRACKET_CONFIRMATION_KEY_REUSED',
            'Idempotency key was used for a different confirmation',
          );
        }
      }
      if (this.isCurrentBracketConflict(e))
        throw fail(
          'BRACKET_ALREADY_EXISTS',
          'An active bracket already exists for this weight class',
        );
      throw e;
    }
  }

  /** Hash stable, semantic claims; token nonce/timestamps are deliberately excluded. */
  private fingerprint(c: BracketPreviewTokenClaims): string {
    const payload = JSON.stringify({
      tournamentId: c.tournamentId,
      weightClassId: c.weightClassId,
      rosterFingerprint: c.rosterFingerprint,
      designatedByeAthleteIds: [...c.designatedByeAthleteIds].sort(),
      bracketSize: c.placements.length,
      placements: [...c.placements]
        .sort((a, b) => a.drawPosition - b.drawPosition)
        .map(({ drawPosition, athleteId }) => [drawPosition, athleteId]),
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  private isConfirmationKeyConflict(error: unknown): boolean {
    return this.uniqueTarget(error).includes(
      'tournament_brackets_confirmation_key_key',
    );
  }

  private isCurrentBracketConflict(error: unknown): boolean {
    return this.uniqueTarget(error).includes(
      'tournament_brackets_one_current_per_weight_class_key',
    );
  }

  private uniqueTarget(error: unknown): string {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    )
      return '';
    return JSON.stringify(error.meta?.target ?? '');
  }

  async find(tournamentId: string, weightClassId: string) {
    const b = await this.prisma.tournamentBracket.findFirst({
      where: {
        tournamentId,
        weightClassId,
        status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
      },
      include: bracketInclude,
    });
    if (!b)
      throw new NotFoundException({
        code: 'BRACKET_NOT_FOUND',
        message: 'No current bracket exists for this weight class',
      });
    return this.view(b);
  }
  private get(tx: Prisma.TransactionClient, id: string) {
    return tx.tournamentBracket
      .findUniqueOrThrow({ where: { id }, include: bracketInclude })
      .then((b) => this.view(b));
  }
  private view(b: BracketViewRecord) {
    return {
      bracket: {
        id: b.id,
        tournamentId: b.tournamentId,
        weightClassId: b.weightClassId,
        status: b.status,
        athleteCount: b.athleteCount,
        bracketSize: b.bracketSize,
        roundCount: b.roundCount,
        confirmedAt: b.confirmedAt,
        championEntrant: b.championEntrant,
      },
      entrants: b.entrants,
      fixtures: b.fixtures,
    };
  }
  private graph(
    c: BracketPreviewTokenClaims,
    eligible: Set<string>,
  ): GeneratedSingleEliminationBracket {
    const ids = c.placements
      .map((p) => p.athleteId)
      .filter((x): x is string => x !== null);
    if (
      c.placements.length < 2 ||
      c.placements.length & (c.placements.length - 1) ||
      ids.length !== eligible.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !eligible.has(id))
    )
      throw fail('BRACKET_GRAPH_INVALID', 'Bracket preview graph is invalid');
    try {
      return buildSingleEliminationBracket(c.placements);
    } catch {
      throw fail('BRACKET_GRAPH_INVALID', 'Bracket preview graph is invalid');
    }
  }
}
