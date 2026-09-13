import { Module } from '@nestjs/common';
import { OfficialAccessModule } from '../official-access/official-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MatchOfficialAssignmentsController } from './match-official-assignments.controller';
import { MatchOfficialAssignmentsService } from './match-official-assignments.service';
@Module({
  imports: [PrismaModule, OfficialAccessModule],
  controllers: [MatchOfficialAssignmentsController],
  providers: [MatchOfficialAssignmentsService],
})
export class MatchOfficialAssignmentsModule {}
