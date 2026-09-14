import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { INVALID_ID_ERROR } from './admin-management.errors';
import {
  AdminManagementService,
  type MatchView,
} from './admin-management.service';
// This class must remain a runtime import for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateMatchDto } from './dto/match.dto';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});

interface MatchResponse {
  match: MatchView;
}

@Controller('admin/matches')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminMatchesController {
  constructor(
    @Inject(AdminManagementService)
    private readonly management: AdminManagementService,
  ) {}

  @Get(':id/monitoring')
  async monitoring(
    @Param('id', uuidPipe) id: string,
    @Req() request: AuthenticatedUserRequest,
  ) {
    await this.management.assertMatchAccess(id, request.user);
    return this.management.getMatchMonitoring(id);
  }

  @Get(':id')
  async get(
    @Param('id', uuidPipe) id: string,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<MatchResponse> {
    await this.management.assertMatchAccess(id, request.user);
    return { match: await this.management.getMatch(id) };
  }

  @Patch(':id')
  async update(
    @Param('id', uuidPipe) id: string,
    @Body() input: UpdateMatchDto,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<MatchResponse> {
    await this.management.assertMatchAccess(id, request.user, true);
    return {
      match: await this.management.updateMatch(id, input, request.user.id),
    };
  }
}
