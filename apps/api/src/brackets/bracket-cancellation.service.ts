import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEventType,
  BracketStatus,
  MatchStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Standard cancellation preserves history; a forced cancellation removes identified operational matches and the bracket. */
@Injectable()
export class BracketCancellationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async cancel(
    tournamentId: string,
    weightClassId: string,
    actorId: string,
    reason: string,
    force = false,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // Keep lock ordering identical to confirmation/preparation to serialize reset vs. confirm.
        await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM tournament_weight_classes WHERE id = ${weightClassId}::uuid AND tournament_id = ${tournamentId}::uuid FOR UPDATE`;
        const bracket = await tx.tournamentBracket.findFirst({
          where: {
            tournamentId,
            weightClassId,
            status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
          },
          include: {
            fixtures: {
              include: {
                match: {
                  select: {
                    id: true,
                    publicId: true,
                    status: true,
                    startedAt: true,
                    finishedAt: true,
                    _count: {
                      select: {
                        scoreEvents: true,
                        penalties: true,
                        rounds: true,
                        refereeVotes: true,
                        resultOperations: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!bracket)
          throw new NotFoundException({
            code: 'BRACKET_NOT_FOUND',
            message: 'No current bracket exists for this weight class',
          });
        await tx.$queryRaw`SELECT id FROM bracket_fixtures WHERE bracket_id = ${bracket.id}::uuid ORDER BY id FOR UPDATE`;
        const unsafeMatches = bracket.fixtures
          .map((fixture) => fixture.match)
          .filter(
            (match) =>
              match !== null &&
              (match.status !== MatchStatus.WAITING ||
                match.startedAt !== null ||
                match.finishedAt !== null ||
                match._count.scoreEvents > 0 ||
                match._count.penalties > 0 ||
                match._count.rounds > 0 ||
                match._count.refereeVotes > 0 ||
                match._count.resultOperations > 0),
          );
        if (unsafeMatches.length && !force)
          throw new ConflictException({
            code: 'BRACKET_CANCELLATION_UNSAFE',
            message: 'Linked operational matches require explicit cancellation confirmation',
            unsafeMatches: unsafeMatches.map((match) => ({
              id: match!.id,
              publicId: match!.publicId,
            })),
          });
        const cancelledAt = new Date();
        if (force) {
          const unsafeMatchIds = unsafeMatches.map((match) => match!.id);
          // These journals/outcomes deliberately use RESTRICT so published results
          // cannot disappear by accident. This endpoint has already received its
          // separate destructive confirmation, so remove them before their match.
          await tx.matchResultPublication.deleteMany({
            where: { matchId: { in: unsafeMatchIds } },
          });
          await tx.matchResultDecision.deleteMany({
            where: { matchId: { in: unsafeMatchIds } },
          });
          await tx.matchOutcome.deleteMany({
            where: { matchId: { in: unsafeMatchIds } },
          });
          await tx.match.deleteMany({
            where: {
              id: { in: unsafeMatchIds },
              tournamentId,
              weightClassId,
            },
          });
          // The bracket graph has RESTRICT links from slots/fixtures to entrants.
          // Remove its dependants explicitly instead of relying on a cascading
          // bracket delete, which PostgreSQL correctly rejects in this graph.
          await tx.bracketSlot.deleteMany({
            where: { fixture: { bracketId: bracket.id } },
          });
          await tx.bracketFixture.deleteMany({ where: { bracketId: bracket.id } });
          await tx.tournamentBracket.update({
            where: { id: bracket.id },
            data: { championEntrantId: null },
          });
          await tx.bracketEntrant.deleteMany({ where: { bracketId: bracket.id } });
          await tx.tournamentBracket.delete({ where: { id: bracket.id } });
        } else {
          await tx.tournamentBracket.update({
            where: { id: bracket.id },
            data: { status: BracketStatus.CANCELLED, cancelledAt },
          });
        }
        await tx.auditLog.create({
          data: {
            adminUserId: actorId,
            eventType: AuditEventType.BRACKET_CANCELLED,
            metadata: {
              actorId,
              reason,
              bracketId: bracket.id,
              tournamentId,
              weightClassId,
              forced: force,
              unsafeMatchIds: unsafeMatches.map((match) => match!.id),
            },
          },
        });
        return {
          bracket: {
            id: bracket.id,
            status: force ? 'DELETED' : BracketStatus.CANCELLED,
            cancelledAt,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
