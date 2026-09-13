import {
  BadRequestException,
  ConflictException,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import {
  AdminManagementService,
  type CreatedMatchResult,
} from '../admin-management/admin-management.service';
import { INVALID_ID_ERROR } from '../admin-management/admin-management.errors';
import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BracketOutcomeService } from './bracket-outcome.service';
import { PrismaService } from '../prisma/prisma.service';
// Nest reads this class from decorator metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DecideBracketWinnerDto } from './dto/decide-bracket-winner.dto';

const uuid = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});

@Controller('admin/tournaments/:tournamentId/brackets/:bracketId/fixtures')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BracketFixturesController {
  constructor(
    @Inject(AdminManagementService)
    private readonly management: AdminManagementService,
    @Inject(BracketOutcomeService)
    private readonly outcomes: BracketOutcomeService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post(':fixtureId/prepare-match')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  async prepare(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('bracketId', uuid) bracketId: string,
    @Param('fixtureId', uuid) fixtureId: string,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<CreatedMatchResult> {
    await this.management.assertTournamentAccess(
      tournamentId,
      request.user,
      true,
    );
    return this.management.prepareBracketFixtureMatch(
      tournamentId,
      bracketId,
      fixtureId,
      request.user.id,
    );
  }

  @Post(':fixtureId/decide-winner')
  async decideWinner(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('bracketId', uuid) bracketId: string,
    @Param('fixtureId', uuid) fixtureId: string,
    @Body() input: DecideBracketWinnerDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.management.assertTournamentAccess(
      tournamentId,
      request.user,
      true,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const fixture = await tx.bracketFixture.findFirst({
          where: { id: fixtureId, bracketId, bracket: { tournamentId } },
          select: { id: true },
        });
        if (!fixture)
          throw new BadRequestException({
            code: 'BRACKET_FIXTURE_NOT_FOUND',
            message: 'Fixture does not belong to bracket',
          });
        return this.outcomes.manuallyDecide(
          tx,
          fixtureId,
          input.entrantId,
          request.user.id,
          input.reason,
          input.idempotencyKey,
        );
      });
    } catch (error) {
      if (!this.isWinnerDecisionKeyConflict(error)) throw error;
      const winner =
        await this.prisma.bracketWinnerDecisionIdempotency.findUnique({
          where: { key: input.idempotencyKey },
        });
      if (!winner) throw error;
      const fingerprint = this.outcomes.manualDecisionFingerprint(
        fixtureId,
        input.entrantId,
        input.reason,
      );
      if (winner.requestFingerprint !== fingerprint)
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: 'Idempotency key was used for a different winner decision',
        });
      return winner.response;
    }
  }

  private isWinnerDecisionKeyConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      JSON.stringify(error.meta?.target ?? '').includes(
        'bracket_winner_decision_idempotency_key_key',
      )
    );
  }
}
