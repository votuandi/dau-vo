import { Controller, Get, Header, Inject, Param } from '@nestjs/common';

import { TournamentWatchService } from './tournament-watch.service';

/**
 * Public, unauthenticated spectator endpoints. The tournament code is the only
 * key; it grants read-only access to schedule, brackets and published results.
 */
@Controller('watch/tournaments/:code')
export class TournamentWatchController {
  constructor(
    @Inject(TournamentWatchService)
    private readonly watch: TournamentWatchService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  overview(@Param('code') code: string) {
    return this.watch.overview(code);
  }

  @Get('brackets')
  @Header('Cache-Control', 'no-store')
  brackets(@Param('code') code: string) {
    return this.watch.brackets(code);
  }

  @Get('matches/:publicId/result')
  @Header('Cache-Control', 'no-store')
  matchResult(
    @Param('code') code: string,
    @Param('publicId') publicId: string,
  ) {
    return this.watch.matchResult(code, publicId);
  }
}

/** Sponsor logos for public screens (/watch and the scoreboard). */
@Controller('public')
export class PublicSponsorsController {
  constructor(
    @Inject(TournamentWatchService)
    private readonly watch: TournamentWatchService,
  ) {}

  @Get('tournaments/:code/sponsors')
  @Header('Cache-Control', 'no-store')
  byTournament(@Param('code') code: string) {
    return this.watch.sponsorsByTournamentCode(code);
  }

  @Get('matches/:publicId/sponsors')
  @Header('Cache-Control', 'no-store')
  byMatch(@Param('publicId') publicId: string) {
    return this.watch.sponsorsByMatch(publicId);
  }
}
