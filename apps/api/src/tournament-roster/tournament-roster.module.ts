import { Module } from '@nestjs/common';
import { AdminManagementModule } from '../admin-management/admin-management.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentRosterController } from './tournament-roster.controller';
import { TournamentRosterService } from './tournament-roster.service';
import { UnitImageService } from './unit-image.service';
@Module({
  imports: [AdminManagementModule, PrismaModule, MediaModule],
  controllers: [TournamentRosterController],
  providers: [TournamentRosterService, UnitImageService],
})
export class TournamentRosterModule {}
