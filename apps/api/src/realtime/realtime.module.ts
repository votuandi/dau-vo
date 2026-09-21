import { Module } from '@nestjs/common';

import { MatchAccessModule } from '../match-access/match-access.module';
import { OfficialAccessModule } from '../official-access/official-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from './realtime-core.module';
import { SportRulesModule } from '../sport-rules/sport-rules.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeMatchStateService } from './realtime-match-state.service';
import { MatchLifecycleService } from './match-lifecycle.service';
import { PenaltyService } from './penalty.service';
import { FaultService } from './fault.service';
import { ScoringService } from './scoring.service';
import { RegulationAppealService } from './regulation-appeal.service';
import { MatchOfficialAssignmentsModule } from '../match-official-assignments/match-official-assignments.module';

@Module({
  exports: [RealtimeMatchStateService],
  imports: [
    MatchAccessModule,
    OfficialAccessModule,
    PrismaModule,
    RealtimeCoreModule,
    SportRulesModule,
    MatchOfficialAssignmentsModule,
  ],
  providers: [
    MatchLifecycleService,
    PenaltyService,
    FaultService,
    RealtimeGateway,
    RealtimeMatchStateService,
    ScoringService,
    RegulationAppealService,
  ],
})
export class RealtimeModule {}
