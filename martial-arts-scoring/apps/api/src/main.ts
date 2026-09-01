import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import pino from 'pino';

import { AppModule } from './app.module';
import { configureApplication } from './configure-application';
import type { EnvironmentVariables } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  const config = app.get(ConfigService<EnvironmentVariables, true>);

  app.useLogger(logger);
  configureApplication(app, config);

  const port = config.getOrThrow('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  const bootstrapLogger = pino({ name: 'api-bootstrap' });
  bootstrapLogger.fatal({ err: error }, 'Unable to start the API');
  process.exitCode = 1;
});
