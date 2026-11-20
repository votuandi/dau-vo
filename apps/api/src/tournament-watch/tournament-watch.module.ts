import { Module } from '@nestjs/common';

import { BracketsModule } from '../brackets/brackets.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  PublicSponsorsController,
  TournamentWatchController,
} from './tournament-watch.controller';
import { TournamentWatchService } from './tournament-watch.service';

@Module({
  imports: [BracketsModule, PrismaModule],
  controllers: [TournamentWatchController, PublicSponsorsController],
  providers: [TournamentWatchService],
})
export class TournamentWatchModule {}
