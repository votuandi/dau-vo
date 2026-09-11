import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TournamentLifecycleService } from './tournament-lifecycle.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  try {
    const result = await app.get(TournamentLifecycleService).run();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}
void main();
