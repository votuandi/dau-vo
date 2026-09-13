import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { OfficialAccessController } from './official-access.controller';
import { OfficialAccessService } from './official-access.service';
import { OfficialSessionGuard } from './official-session.guard';
@Module({
  imports: [PrismaModule, RedisModule, RealtimeCoreModule],
  controllers: [OfficialAccessController],
  providers: [OfficialAccessService, OfficialSessionGuard],
  exports: [OfficialAccessService, OfficialSessionGuard],
})
export class OfficialAccessModule {}
