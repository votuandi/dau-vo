import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BracketFixtureStatus,
  BracketStatus,
  Prisma,
  TournamentOfficialRole,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { SportGroupRulesNotImplementedError } from '../sport-rules/sport-rules.errors';

@Injectable()
export class BracketRoundStaffingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SportRulesRegistry) private readonly rules: SportRulesRegistry,
  ) {}

  async update(
    tournamentId: string,
    weightClassId: string,
    roundNumber: number,
    requiredRefereeCount: number,
    actorId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
        const tournament = await tx.tournament.findFirst({
          where: { id: tournamentId, softDeletedAt: null },
          select: {
            status: true,
            sport: { select: { sportGroup: { select: { code: true } } } },
          },
        });
        if (!tournament)
          throw new NotFoundException({
            code: 'TOURNAMENT_NOT_FOUND',
            message: 'Tournament not found',
          });
        if (tournament.status === TournamentStatus.ARCHIVED)
          throw new ConflictException({
            code: 'TOURNAMENT_ARCHIVED',
            message: 'Tournament is archived',
          });
        // Global official/staffing order: tournament, officials by UUID, then
        // bracket staffing. This shares the first lock with match preparation.
        await tx.$queryRaw`SELECT id FROM tournament_officials WHERE tournament_id = ${tournamentId}::uuid AND role = 'REFEREE' ORDER BY id FOR UPDATE`;
        let policy;
        try {
          policy = this.rules.resolve(tournament.sport.sportGroup.code);
        } catch (error) {
          if (error instanceof SportGroupRulesNotImplementedError)
            throw new ConflictException({
              code: error.code,
              message: 'This sport group does not have an implemented ruleset',
            });
          throw error;
        }
        const bracket = await tx.tournamentBracket.findFirst({
          where: { tournamentId, weightClassId, status: BracketStatus.ACTIVE },
          select: { id: true, roundCount: true },
        });
        if (!bracket)
          throw new NotFoundException({
            code: 'BRACKET_NOT_FOUND',
            message: 'No active bracket exists for this weight class',
          });
        await tx.$queryRaw`SELECT id FROM bracket_round_staffing WHERE bracket_id = ${bracket.id}::uuid ORDER BY round_number FOR UPDATE`;
        const staffing = await tx.bracketRoundStaffing.findUnique({
          where: {
            bracketId_roundNumber: { bracketId: bracket.id, roundNumber },
          },
        });
        if (!staffing)
          throw new NotFoundException({
            code: 'BRACKET_ROUND_NOT_FOUND',
            message: 'Bracket round not found',
          });
        const prepared = await tx.bracketFixture.findFirst({
          where: {
            bracketId: bracket.id,
            roundNumber,
            status: {
              in: [
                BracketFixtureStatus.MATCH_PREPARED,
                BracketFixtureStatus.AWAITING_WINNER,
                BracketFixtureStatus.COMPLETED,
              ],
            },
          },
          select: { id: true },
        });
        if (prepared)
          throw new ConflictException({
            code: 'BRACKET_ROUND_STAFFING_LOCKED',
            message:
              'Staffing is locked after a match in this round is prepared',
          });
        const activeRefereeCount = await tx.tournamentOfficial.count({
          where: {
            tournamentId,
            role: TournamentOfficialRole.REFEREE,
            isActive: true,
          },
        });
        if (
          requiredRefereeCount < policy.minimumRequiredRefereeCount ||
          (policy.requiresOddRefereeCount && requiredRefereeCount % 2 === 0) ||
          requiredRefereeCount > activeRefereeCount
        )
          throw new ConflictException({
            code: 'BRACKET_ROUND_STAFFING_INVALID',
            message:
              'Referee count does not satisfy the tournament staffing policy',
            details: {
              activeRefereeCount,
              minimumRequiredRefereeCount: policy.minimumRequiredRefereeCount,
              requiresOddRefereeCount: policy.requiresOddRefereeCount,
            },
          });
        const updated = await tx.bracketRoundStaffing.update({
          where: { id: staffing.id },
          data: { requiredRefereeCount },
        });
        await tx.auditLog.create({
          data: {
            adminUserId: actorId,
            eventType: 'BRACKET_ROUND_STAFFING_UPDATED',
            metadata: {
              tournamentId,
              bracketId: bracket.id,
              roundNumber,
              before: staffing.requiredRefereeCount,
              after: requiredRefereeCount,
            },
          },
        });
        return {
          staffing: {
            ...updated,
            roundLabel: this.label(roundNumber, bracket.roundCount),
            activeRefereeCount,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private label(roundNumber: number, roundCount: number) {
    const distance = roundCount - roundNumber;
    return distance === 0
      ? 'Chung kết'
      : distance === 1
        ? 'Bán kết'
        : distance === 2
          ? 'Tứ kết'
          : `Vòng ${roundNumber}`;
  }
}
