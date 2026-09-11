import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { RedisModule } from '../redis/redis.module';
import { MatchAccessController } from './match-access.controller';
import { MatchAccessService } from './match-access.service';
import { MatchSessionGuard } from './match-session.guard';

@Module({
  controllers: [MatchAccessController],
  exports: [MatchAccessService, MatchSessionGuard],
  imports: [PrismaModule, RedisModule, RealtimeCoreModule],
  providers: [MatchAccessService, MatchSessionGuard],
})
export class MatchAccessModule {}
