import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';

import {
  type EnvironmentVariables,
  validateEnvironment,
} from './config/environment';
import { AuthModule } from './auth/admin-auth.module';
import { AdminManagementModule } from './admin-management/admin-management.module';
import { HealthModule } from './health/health.module';
import { MatchAccessModule } from './match-access/match-access.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeCoreModule } from './realtime/realtime-core.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { PublicViewModule } from './public-view/public-view.module';
import { PricingModule } from './pricing/pricing.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { MediaModule } from './media/media.module';
import { TournamentRosterModule } from './tournament-roster/tournament-roster.module';
import { BracketsModule } from './brackets/brackets.module';
import { TournamentOfficialsModule } from './tournament-officials/tournament-officials.module';
import { OfficialAccessModule } from './official-access/official-access.module';
import { MatchOfficialAssignmentsModule } from './match-official-assignments/match-official-assignments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', '../../.env'],
      expandVariables: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          genReqId: (request) => {
            const requestId = request.headers['x-request-id'];

            return typeof requestId === 'string' && requestId.length <= 128
              ? requestId
              : randomUUID();
          },
          level:
            config.getOrThrow('NODE_ENV', { infer: true }) === 'production'
              ? 'info'
              : 'debug',
          redact: {
            censor: '[REDACTED]',
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.securityCode',
              'req.body.privatePasscode',
              'req.body.takeoverToken',
              'req.body.setupToken',
              'req.body.previewToken',
              'res.headers.set-cookie',
            ],
          },
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    RealtimeCoreModule,
    AuthModule,
    AdminManagementModule,
    MatchAccessModule,
    RealtimeModule,
    HealthModule,
    PublicViewModule,
    PricingModule,
    SubscriptionsModule,
    SuperAdminModule,
    MediaModule,
    TournamentRosterModule,
    BracketsModule,
    TournamentOfficialsModule,
    OfficialAccessModule,
    MatchOfficialAssignmentsModule,
  ],
})
export class AppModule {}
