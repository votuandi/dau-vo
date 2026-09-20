import {
  Body,
  Controller,
  Get,
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
import { TakeMatchDto } from './dto/take-match.dto';

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
  @Post(':matchId/take') take(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body() body: TakeMatchDto,
    @Req() request: AuthenticatedOfficialRequest,
  ) {
    return this.assignments.take(
      matchId,
      body.refereeIds,
      request.officialSession,
    );
  }
}
