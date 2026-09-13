import { Module } from '@nestjs/common';
import { OfficialAccessModule } from '../official-access/official-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { MatchOfficialAssignmentsController } from './match-official-assignments.controller';
import { MatchOfficialAssignmentsService } from './match-official-assignments.service';
import { MatchOfficialAssignmentLifecycleService } from './match-official-assignment-lifecycle.service';
@Module({
  imports: [PrismaModule, OfficialAccessModule, RealtimeCoreModule],
  controllers: [MatchOfficialAssignmentsController],
  exports: [MatchOfficialAssignmentLifecycleService],
  providers: [
    MatchOfficialAssignmentsService,
    MatchOfficialAssignmentLifecycleService,
  ],
})
export class MatchOfficialAssignmentsModule {}
