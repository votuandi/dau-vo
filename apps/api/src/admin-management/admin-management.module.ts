import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SportRulesModule } from '../sport-rules/sport-rules.module';
import { AdminManagementService } from './admin-management.service';
import { AdminMatchesController } from './admin-matches.controller';
import { AdminTournamentsController } from './admin-tournaments.controller';
import { MatchCredentialGeneratorService } from './match-credential-generator.service';

@Module({
  controllers: [AdminTournamentsController, AdminMatchesController],
  exports: [AdminManagementService, MatchCredentialGeneratorService],
  imports: [AuthModule, PrismaModule, RealtimeCoreModule, RealtimeModule, SportRulesModule],
  providers: [AdminManagementService, MatchCredentialGeneratorService],
})
export class AdminManagementModule {}
