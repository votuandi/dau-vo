import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './admin-auth.controller';
import { AuthGuard } from './admin-auth.guard';
import { AuthService } from './admin-auth.service';

@Module({
  controllers: [AuthController],
  exports: [AuthGuard, AuthService],
  imports: [PrismaModule, RedisModule],
  providers: [AuthGuard, AuthService],
})
export class AuthModule {}
