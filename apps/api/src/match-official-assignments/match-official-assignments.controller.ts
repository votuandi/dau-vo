import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OfficialSessionGuard } from '../official-access/official-session.guard';
import type { AuthenticatedOfficialRequest } from '../official-access/official-access.types';
import { MatchOfficialAssignmentsService } from './match-official-assignments.service';
// Nest reads this class from decorator metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfirmMatchOfficialAssignmentDto } from './dto/confirm-match-official-assignment.dto';

@Controller('official/matches')
@UseGuards(OfficialSessionGuard)
export class MatchOfficialAssignmentsController {
  constructor(
    @Inject(MatchOfficialAssignmentsService)
    private readonly assignments: MatchOfficialAssignmentsService,
  ) {}
  @Get() list(@Req() request: AuthenticatedOfficialRequest) {
    return this.assignments.list(request.officialSession);
  }
  @Get(':matchId') state(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: AuthenticatedOfficialRequest,
  ) {
    return this.assignments.state(matchId, request.officialSession);
  }
  @Post(':matchId/claim') claim(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: AuthenticatedOfficialRequest,
  ) {
    return this.assignments.claim(matchId, request.officialSession);
  }
  @Post(':matchId/referees') confirm(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body() body: ConfirmMatchOfficialAssignmentDto,
    @Req() request: AuthenticatedOfficialRequest,
  ) {
    return this.assignments.confirm(
      matchId,
      body.refereeIds,
      request.officialSession,
    );
  }
  @Delete(':matchId/claim') @HttpCode(200) release(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Req() request: AuthenticatedOfficialRequest,
  ) {
    return this.assignments.release(matchId, request.officialSession);
  }
}
