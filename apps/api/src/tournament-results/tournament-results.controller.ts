import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedOfficialRequest } from '../official-access/official-access.types';
import { OfficialSessionGuard } from '../official-access/official-session.guard';
import { TournamentResultsService } from './tournament-results.service';

/** Supervisor-only: announce a weight class's podium to every scoreboard of the tournament. */
@Controller('official/tournament-results')
@UseGuards(OfficialSessionGuard)
export class TournamentResultsController {
  constructor(
    @Inject(TournamentResultsService)
    private readonly results: TournamentResultsService,
  ) {}

  @Get()
  announceable(@Req() request: AuthenticatedOfficialRequest) {
    return this.results.announceable(request.officialSession);
  }

  @Post(':bracketId/announce')
  announce(
    @Param('bracketId', new ParseUUIDPipe()) bracketId: string,
    @Req() request: AuthenticatedOfficialRequest,
  ) {
    return this.results.announce(bracketId, request.officialSession);
  }
}
