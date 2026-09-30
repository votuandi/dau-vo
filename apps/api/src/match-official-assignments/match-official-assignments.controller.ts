import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OfficialSessionGuard } from '../official-access/official-session.guard';
import type { AuthenticatedOfficialRequest } from '../official-access/official-access.types';
import { MatchOfficialAssignmentsService } from './match-official-assignments.service';
import { AdminManagementService } from '../admin-management/admin-management.service';
// Nest reads this class from decorator metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TakeMatchDto } from './dto/take-match.dto';

@Controller('official/matches')
@UseGuards(OfficialSessionGuard)
export class MatchOfficialAssignmentsController {
  constructor(
    @Inject(MatchOfficialAssignmentsService)
    private readonly assignments: MatchOfficialAssignmentsService,
    @Inject(AdminManagementService)
    private readonly management: AdminManagementService,
  ) {}
  @Get() list(@Req() request: AuthenticatedOfficialRequest) {
    return this.assignments.list(request.officialSession);
  }
  @Get(':matchId')
  async state(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: AuthenticatedOfficialRequest,
    @Query('include') include?: string,
  ) {
    const state = await this.assignments.state(matchId, request.officialSession);
    if (include !== 'var') return state;

    await this.assignments.assertActiveSupervisorAssignment(
      matchId,
      request.officialSession,
    );
    return {
      ...state,
      varMonitoring: await this.management.getSupervisorVarMonitoring(matchId),
    };
  }
  @Post(':matchId/take') take(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body() body: TakeMatchDto,
    @Req() request: AuthenticatedOfficialRequest,
  ) {
    return this.assignments.take(
      matchId,
      body.judgeIds,
      request.officialSession,
    );
  }
}
