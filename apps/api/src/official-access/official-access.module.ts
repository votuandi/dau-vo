import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { OfficialAccessController } from './official-access.controller';
import { OfficialAccessService } from './official-access.service';
import { OfficialSessionGuard } from './official-session.guard';
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [OfficialAccessController],
  providers: [OfficialAccessService, OfficialSessionGuard],
  exports: [OfficialAccessService, OfficialSessionGuard],
})
export class OfficialAccessModule {}
