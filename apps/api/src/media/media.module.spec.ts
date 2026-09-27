import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/environment';
import { LocalImageStorage } from './local-image-storage';
import { createImageStorage } from './media.module';
import { S3ImageStorage } from './s3-image-storage';

describe('createImageStorage', () => {
  it.each([
    ['local', LocalImageStorage],
    ['s3', S3ImageStorage],
  ] as const)('chooses %s storage provider', (driver, provider) => {
    const values = {
      IMAGE_STORAGE_DRIVER: driver,
      IMAGE_UPLOAD_ROOT: 'public/uploads',
      S3_BUCKET: 'private-images',
      AWS_REGION: 'ap-southeast-1',
    };
    const config = {
      getOrThrow: (name: keyof typeof values) => values[name],
    } as unknown as ConfigService<EnvironmentVariables, true>;

    expect(createImageStorage(config)).toBeInstanceOf(provider);
  });
});
