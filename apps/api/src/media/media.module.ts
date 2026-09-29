import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'node:path';
import { MediaController } from './media.controller';
import { IMAGE_STORAGE } from './image-storage';
import { LocalImageStorage } from './local-image-storage';
import { MediaDeletionService } from './media-deletion.service';
import { S3ImageStorage } from './s3-image-storage';
import type { EnvironmentVariables } from '../config/environment';

export function createImageStorage(
  config: ConfigService<EnvironmentVariables, true>,
) {
  const driver = config.getOrThrow('IMAGE_STORAGE_DRIVER', { infer: true });
  if (driver === 'local') {
    return new LocalImageStorage(
      path.resolve(config.getOrThrow('IMAGE_UPLOAD_ROOT', { infer: true })),
    );
  }
  return new S3ImageStorage(
    config.getOrThrow('S3_BUCKET', { infer: true }),
    config.getOrThrow('AWS_REGION', { infer: true }),
  );
}

@Module({
  controllers: [MediaController],
  exports: [IMAGE_STORAGE, MediaDeletionService],
  providers: [
    MediaDeletionService,
    {
      provide: IMAGE_STORAGE,
      inject: [ConfigService],
      useFactory: createImageStorage,
    },
  ],
})
export class MediaModule {}
