import { OfficialAccessModule } from '../official-access/official-access.module';
import { Module } from '@nestjs/common';
import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { TournamentOfficialsController } from './tournament-officials.controller';
import { TournamentOfficialsService } from './tournament-officials.service';

@Module({
  imports: [
    OfficialAccessModule,
    AdminManagementModule,
    AuthModule,
    PrismaModule,
    RealtimeCoreModule,
  ],
  controllers: [TournamentOfficialsController],
  providers: [TournamentOfficialsService],
})
export class TournamentOfficialsModule {}
