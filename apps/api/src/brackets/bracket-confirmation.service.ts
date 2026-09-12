/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AthleteColor,
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

const fail = (code: string, message: string) =>
  new ConflictException({ code, message });

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
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM tournament_weight_classes WHERE id = ${weightClassId}::uuid AND tournament_id = ${tournamentId}::uuid FOR UPDATE`;
        const existing = await tx.tournamentBracket.findUnique({
          where: { confirmationKey: input.idempotencyKey },
          include: this.include,
        });
        if (existing) {
          if (
            existing.tournamentId !== tournamentId ||
            existing.weightClassId !== weightClassId ||
            existing.athleteCount !==
              claims.placements.filter((p) => p.athleteId).length ||
            existing.bracketSize !== claims.placements.length
          )
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
              status: BracketStatus.ACTIVE,
            },
          })
        )
          throw fail(
            'BRACKET_ALREADY_EXISTS',
            'An active bracket already exists for this weight class',
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
        const bracket = await tx.tournamentBracket.create({
          data: {
            tournamentId,
            weightClassId,
            athleteCount: athletes.length,
            bracketSize: claims.placements.length,
            roundCount: graph.roundCount,
            confirmationKey: input.idempotencyKey,
            confirmedByUserId: userId,
            entrants: {
              create: claims.placements
                .filter((p) => p.athleteId)
                .map((p) => {
                  const a = byId.get(p.athleteId!)!;
                  const at = graph.opening.get(p.drawPosition)!;
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
                    initialRoundNumber: at.round,
                    initialFixturePosition: at.position,
                    initialSide: at.side,
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
          const slots = (f.slots as any[]).map((s: any) => ({
            side: s.side,
            directEntrantId: s.athleteId ? entrants.get(s.athleteId)! : null,
            sourceFixtureId: s.source ? fixtureIds.get(s.source)! : null,
            resolvedEntrantId: s.athleteId ? entrants.get(s.athleteId)! : null,
          }));
          const row = await tx.bracketFixture.create({
            data: {
              bracketId: bracket.id,
              roundNumber: f.round,
              position: f.position,
              displayReference: `R${f.round}-M${String(f.position).padStart(2, '0')}`,
              status: slots.every((s: any) => s.resolvedEntrantId)
                ? BracketFixtureStatus.READY
                : BracketFixtureStatus.PENDING_PARTICIPANTS,
              slots: { create: slots },
            },
          });
          fixtureIds.set(f.id, row.id);
        }
        return this.get(tx, bracket.id);
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw fail(
          'BRACKET_ALREADY_EXISTS',
          'An active bracket already exists for this weight class',
        );
      throw e;
    }
  }

  async find(tournamentId: string, weightClassId: string) {
    const b = await this.prisma.tournamentBracket.findFirst({
      where: { tournamentId, weightClassId, status: BracketStatus.ACTIVE },
      include: this.include,
    });
    if (!b)
      throw new NotFoundException({
        code: 'BRACKET_NOT_FOUND',
        message: 'No active bracket exists for this weight class',
      });
    return this.view(b);
  }
  private get(tx: Prisma.TransactionClient, id: string) {
    return tx.tournamentBracket
      .findUniqueOrThrow({ where: { id }, include: this.include })
      .then((b) => this.view(b));
  }
  private readonly include: Prisma.TournamentBracketInclude = {
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
  };
  private view(b: any) {
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
      },
      entrants: b.entrants,
      fixtures: b.fixtures,
    };
  }
  private graph(c: BracketPreviewTokenClaims, eligible: Set<string>) {
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
    let nodes: any[] = c.placements.map((p, i) =>
      p.athleteId ? { athleteId: p.athleteId, draw: i + 1 } : null,
    );
    const fixtures: any[] = [];
    const opening = new Map<number, any>();
    let round = 1;
    while (nodes.length > 1) {
      const next: any[] = [];
      for (let i = 0; i < nodes.length; i += 2) {
        const a = nodes[i],
          b = nodes[i + 1];
        if (!a && !b)
          throw fail('BRACKET_GRAPH_INVALID', 'Bracket has a double bye');
        if (!a || !b) {
          next.push(a ?? b);
          continue;
        }
        const f = {
          id: `r${round}-m${i / 2 + 1}`,
          round,
          position: i / 2 + 1,
          slots: [
            { side: AthleteColor.RED, athleteId: a.athleteId, source: a.id },
            { side: AthleteColor.BLUE, athleteId: b.athleteId, source: b.id },
          ],
        };
        fixtures.push(f);
        if (a.draw)
          opening.set(a.draw, {
            round,
            position: f.position,
            side: AthleteColor.RED,
            bye: !b,
          });
        if (b.draw)
          opening.set(b.draw, {
            round,
            position: f.position,
            side: AthleteColor.BLUE,
            bye: !a,
          });
        next.push({ id: f.id });
      }
      nodes = next;
      round++;
    }
    if (fixtures.length !== ids.length - 1)
      throw fail('BRACKET_GRAPH_INVALID', 'Bracket fixture count is invalid');
    return { fixtures, opening, roundCount: round - 1 };
  }
}
