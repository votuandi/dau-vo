import { Module } from '@nestjs/common';

import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminManagementService } from './admin-management.service';
import { AdminMatchesController } from './admin-matches.controller';
import { AdminTournamentsController } from './admin-tournaments.controller';
import { MatchCredentialGeneratorService } from './match-credential-generator.service';

@Module({
  controllers: [AdminTournamentsController, AdminMatchesController],
  exports: [AdminManagementService, MatchCredentialGeneratorService],
  imports: [AdminAuthModule, PrismaModule, RealtimeCoreModule, RealtimeModule],
  providers: [AdminManagementService, MatchCredentialGeneratorService],
})
export class AdminManagementModule {}
