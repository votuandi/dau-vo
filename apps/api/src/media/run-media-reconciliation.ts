import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MediaDeletionService } from './media-deletion.service';

async function main(): Promise<void> {
  const limitArgument = process.argv.find((value) =>
    value.startsWith('--limit='),
  );
  const parsedLimit = limitArgument
    ? Number(limitArgument.slice('--limit='.length))
    : 100;
  if (
    !Number.isSafeInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > 1_000
  )
    throw new Error('--limit must be an integer between 1 and 1000');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    process.stdout.write(
      `${JSON.stringify(await app.get(MediaDeletionService).reconcile(parsedLimit))}\n`,
    );
  } finally {
    await app.close();
  }
}
void main();
