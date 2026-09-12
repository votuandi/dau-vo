import { Module } from '@nestjs/common';
import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/admin-auth.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentRosterController } from './tournament-roster.controller';
import { OrganizationService } from './tournament-roster.service';
import { OrganizationImageService } from './organization-image.service';
import { AthleteService, ATHLETE_CLOCK } from './athlete.service';
import { AthleteImageService } from './athlete-image.service';
@Module({
  imports: [AdminManagementModule, AuthModule, PrismaModule, MediaModule],
  controllers: [TournamentRosterController],
  providers: [
    OrganizationService,
    OrganizationImageService,
    AthleteService,
    AthleteImageService,
    { provide: ATHLETE_CLOCK, useValue: { now: () => new Date() } },
  ],
})
export class TournamentRosterModule {}
