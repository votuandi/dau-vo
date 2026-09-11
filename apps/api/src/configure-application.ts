import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

import type { EnvironmentVariables } from './config/environment';
import { RealtimeSocketIoAdapter } from './realtime/realtime-socket-io.adapter';
import { RedisService } from './redis/redis.service';

export function configureApplication(
  app: INestApplication,
  config: ConfigService<EnvironmentVariables, true>,
): void {
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
    }),
  );
  app.enableCors({
    credentials: true,
    origin: config.getOrThrow('WEB_ORIGIN', { infer: true }),
  });
  app.useWebSocketAdapter(
    new RealtimeSocketIoAdapter(
      app,
      config.getOrThrow('WEB_ORIGIN', { infer: true }),
      app.get(RedisService),
    ),
  );
  app.enableShutdownHooks();
}
