import { Module } from '@nestjs/common';

import { MatchAccessModule } from '../match-access/match-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from './realtime-core.module';
import { SportRulesModule } from '../sport-rules/sport-rules.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeMatchStateService } from './realtime-match-state.service';
import { MatchLifecycleService } from './match-lifecycle.service';
import { PenaltyService } from './penalty.service';
import { ScoringService } from './scoring.service';

@Module({
  exports: [RealtimeMatchStateService],
  imports: [MatchAccessModule, PrismaModule, RealtimeCoreModule, SportRulesModule],
  providers: [
    MatchLifecycleService,
    PenaltyService,
    RealtimeGateway,
    RealtimeMatchStateService,
    ScoringService,
  ],
})
export class RealtimeModule {}
