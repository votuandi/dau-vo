import { Module } from '@nestjs/common';
import { AdminManagementModule } from '../admin-management/admin-management.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentRosterController } from './tournament-roster.controller';
import { TournamentRosterService } from './tournament-roster.service';
import { UnitImageService } from './unit-image.service';
import { AthleteService, ATHLETE_CLOCK } from './athlete.service';
import { AthleteImageService } from './athlete-image.service';
@Module({
  imports: [AdminManagementModule, PrismaModule, MediaModule],
  controllers: [TournamentRosterController],
  providers: [
    TournamentRosterService,
    UnitImageService,
    AthleteService,
    AthleteImageService,
    { provide: ATHLETE_CLOCK, useValue: { now: () => new Date() } },
  ],
})
export class TournamentRosterModule {}
