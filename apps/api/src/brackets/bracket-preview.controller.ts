import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { BracketConfirmationService } from './bracket-confirmation.service';
// Nest reads this class from decorator metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfirmBracketDto } from './dto/confirm-bracket.dto';
// Nest reads this class from decorator metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CancelBracketDto } from './dto/cancel-bracket.dto';
import { BracketCancellationService } from './bracket-cancellation.service';
import { BracketDrawSetupService } from './bracket-draw-setup.service';
// Nest reads this class from decorator metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PreviewBracketDto } from './dto/preview-bracket.dto';

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
    @Inject(BracketConfirmationService)
    private readonly confirmations: BracketConfirmationService,
    @Inject(BracketCancellationService)
    private readonly cancellations: BracketCancellationService,
    @Inject(BracketDrawSetupService)
    private readonly drawSetup: BracketDrawSetupService,
  ) {}

  @Get('draw-setup')
  @Header('Cache-Control', 'no-store')
  async setup(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) weightClassId: string,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, request.user, true);
    return this.drawSetup.setup(tournamentId, weightClassId);
  }

  @Post('preview')
  @Header('Cache-Control', 'no-store')
  async preview(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) weightClassId: string,
    @Body() input: PreviewBracketDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, request.user, true);
    return this.previews.preview(tournamentId, weightClassId, input);
  }

  @Post('confirm')
  @Header('Cache-Control', 'no-store')
  async confirm(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) weightClassId: string,
    @Body() input: ConfirmBracketDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, request.user, true);
    return this.confirmations.confirm(
      tournamentId,
      weightClassId,
      input,
      request.user.id,
    );
  }

  @Get()
  async get(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) weightClassId: string,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, request.user);
    return this.confirmations.find(tournamentId, weightClassId);
  }

  @Post('cancel')
  @Header('Cache-Control', 'no-store')
  async cancel(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) weightClassId: string,
    @Body() input: CancelBracketDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, request.user, true);
    return this.cancellations.cancel(
      tournamentId,
      weightClassId,
      request.user.id,
      input.reason,
    );
  }
}
