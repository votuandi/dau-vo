import {
  BadRequestException,
  Controller,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
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
import { BracketPreviewService } from './bracket-preview.service';

const uuid = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});

@Controller(
  'admin/tournaments/:tournamentId/weight-classes/:weightClassId/bracket',
)
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BracketPreviewController {
  constructor(
    @Inject(AdminManagementService)
    private readonly access: AdminManagementService,
    @Inject(BracketPreviewService)
    private readonly previews: BracketPreviewService,
  ) {}

  @Post('preview')
  @Header('Cache-Control', 'no-store')
  async preview(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) weightClassId: string,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, request.user, true);
    return this.previews.preview(tournamentId, weightClassId);
  }
}
