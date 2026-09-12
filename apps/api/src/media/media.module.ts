import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'node:path';
import { MediaController } from './media.controller';
import { IMAGE_STORAGE } from './image-storage';
import { LocalImageStorage } from './local-image-storage';
import type { EnvironmentVariables } from '../config/environment';

@Module({
  controllers: [MediaController],
  exports: [IMAGE_STORAGE],
  providers: [
    {
      provide: IMAGE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new LocalImageStorage(
          path.resolve(config.getOrThrow('IMAGE_UPLOAD_ROOT', { infer: true })),
        ),
    },
  ],
})
export class MediaModule {}
