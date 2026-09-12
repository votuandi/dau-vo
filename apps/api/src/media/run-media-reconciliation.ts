import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MediaDeletionService } from './media-deletion.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    process.stdout.write(
      `${JSON.stringify(await app.get(MediaDeletionService).reconcile())}\n`,
    );
  } finally {
    await app.close();
  }
}
void main();
