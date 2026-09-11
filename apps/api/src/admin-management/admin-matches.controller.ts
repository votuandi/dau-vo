import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MatchAccessRole } from '@prisma/client';

import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import {
  INVALID_ACCESS_ROLE_ERROR,
  INVALID_ID_ERROR,
} from './admin-management.errors';
import {
  AdminManagementService,
  type MatchView,
  type RegeneratedAccessCodesResult,
} from './admin-management.service';
// This class must remain a runtime import for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateMatchDto } from './dto/match.dto';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});

const accessRolePipe = new ParseEnumPipe(MatchAccessRole, {
  exceptionFactory: () => new BadRequestException(INVALID_ACCESS_ROLE_ERROR),
});

interface MatchResponse {
  match: MatchView;
}

@Controller('admin/matches')
@UseGuards(AuthGuard)
export class AdminMatchesController {
  constructor(
    @Inject(AdminManagementService)
    private readonly management: AdminManagementService,
  ) {}

  @Get(':id/monitoring')
  async monitoring(@Param('id', uuidPipe) id: string) {
    return this.management.getMatchMonitoring(id);
  }

  @Get(':id')
  async get(@Param('id', uuidPipe) id: string): Promise<MatchResponse> {
    return { match: await this.management.getMatch(id) };
  }

  @Patch(':id')
  async update(
    @Param('id', uuidPipe) id: string,
    @Body() input: UpdateMatchDto,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<MatchResponse> {
    return {
      match: await this.management.updateMatch(id, input, request.user.id),
    };
  }

  @Post(':id/access-codes/regenerate')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  regenerateAllAccessCodes(
    @Param('id', uuidPipe) id: string,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<RegeneratedAccessCodesResult> {
    return this.management.regenerateAllAccessCodes(id, request.user.id);
  }

  @Post(':id/access-codes/:role/regenerate')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  regenerateAccessCode(
    @Param('id', uuidPipe) id: string,
    @Param('role', accessRolePipe) role: MatchAccessRole,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<RegeneratedAccessCodesResult> {
    return this.management.regenerateAccessCode(id, role, request.user.id);
  }
}
