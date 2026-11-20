import { Module } from '@nestjs/common';

import { OfficialAccessModule } from '../official-access/official-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { TournamentResultsController } from './tournament-results.controller';
import { TournamentResultsService } from './tournament-results.service';

@Module({
  imports: [OfficialAccessModule, PrismaModule, RealtimeCoreModule],
  controllers: [TournamentResultsController],
  providers: [TournamentResultsService],
})
export class TournamentResultsModule {}
