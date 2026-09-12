import {
  BadRequestException,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  AdminManagementService,
  type CreatedMatchResult,
} from '../admin-management/admin-management.service';
import { INVALID_ID_ERROR } from '../admin-management/admin-management.errors';
import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

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
}
