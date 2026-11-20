import { Module } from '@nestjs/common';
import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/admin-auth.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TournamentSponsorsController } from './tournament-sponsors.controller';
import { TournamentSponsorService } from './tournament-sponsors.service';

@Module({
  imports: [AdminManagementModule, AuthModule, PrismaModule, MediaModule],
  controllers: [TournamentSponsorsController],
  providers: [TournamentSponsorService],
})
export class TournamentSponsorsModule {}
