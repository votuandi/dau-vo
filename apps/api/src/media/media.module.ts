import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'node:path';
import { MediaController } from './media.controller';
import { IMAGE_STORAGE } from './image-storage';
import { LocalImageStorage } from './local-image-storage';
import { MediaDeletionService } from './media-deletion.service';
import type {
  EnvironmentVariables,
  ImageStorageDriver,
} from '../config/environment';

function createImageStorage(config: ConfigService<EnvironmentVariables, true>) {
  const driver = config.getOrThrow('IMAGE_STORAGE_DRIVER', { infer: true });
  if (driver === 'local') {
    return new LocalImageStorage(
      path.resolve(config.getOrThrow('IMAGE_UPLOAD_ROOT', { infer: true })),
    );
  }

  assertS3AdapterIsAvailable(driver);
}

function assertS3AdapterIsAvailable(driver: ImageStorageDriver): never {
  throw new Error(
    `IMAGE_STORAGE_DRIVER=${driver} is configured, but the S3 image-storage adapter is not implemented`,
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
