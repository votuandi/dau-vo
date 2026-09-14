import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminManagementService } from '../admin-management/admin-management.service';
import { INVALID_ID_ERROR } from '../admin-management/admin-management.errors';
// These classes must remain runtime imports for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateTournamentOfficialDto,
  TournamentOfficialListQueryDto,
  UpdateTournamentOfficialDto,
} from './dto/official.dto';
import { TournamentOfficialsService } from './tournament-officials.service';

const uuid = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});

@Controller('admin/tournaments/:tournamentId/officials')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class TournamentOfficialsController {
  constructor(
    @Inject(AdminManagementService)
    private readonly access: AdminManagementService,
    @Inject(TournamentOfficialsService)
    private readonly officials: TournamentOfficialsService,
  ) {}

  @Get()
  async list(
    @Param('tournamentId', uuid) tournamentId: string,
    @Query() query: TournamentOfficialListQueryDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return this.officials.list(tournamentId, query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(
    @Param('tournamentId', uuid) tournamentId: string,
    @Body() input: CreateTournamentOfficialDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return this.officials.create(tournamentId, input, req.user.id);
  }

  @Get(':officialId')
  async get(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('officialId', uuid) officialId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return { official: await this.officials.get(tournamentId, officialId) };
  }

  @Patch(':officialId')
  async update(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('officialId', uuid) officialId: string,
    @Body() input: UpdateTournamentOfficialDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      official: await this.officials.update(
        tournamentId,
        officialId,
        input,
        req.user.id,
      ),
    };
  }

  @Delete(':officialId')
  async deactivate(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('officialId', uuid) officialId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      official: await this.officials.deactivate(
        tournamentId,
        officialId,
        req.user.id,
      ),
    };
  }

  @Post(':officialId/passcode/regenerate')
  @Header('Cache-Control', 'no-store')
  async regenerate(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('officialId', uuid) officialId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return this.officials.regeneratePasscode(
      tournamentId,
      officialId,
      req.user.id,
    );
  }
}
