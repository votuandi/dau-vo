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

/** Cancelling is a history-preserving reset: no fixtures, matches, codes, or results are deleted. */
@Injectable()
export class BracketCancellationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async cancel(
    tournamentId: string,
    weightClassId: string,
    actorId: string,
    reason: string,
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
        const unsafe = bracket.fixtures
          .map((fixture) => fixture.match)
          .find(
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
        if (unsafe)
          throw new ConflictException({
            code: 'BRACKET_CANCELLATION_UNSAFE',
            message:
              'A linked operational match has started or has protected result history',
          });
        const cancelledAt = new Date();
        await tx.tournamentBracket.update({
          where: { id: bracket.id },
          data: { status: BracketStatus.CANCELLED, cancelledAt },
        });
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
            },
          },
        });
        return {
          bracket: {
            id: bracket.id,
            status: BracketStatus.CANCELLED,
            cancelledAt,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
