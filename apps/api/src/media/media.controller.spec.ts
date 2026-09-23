import { Test } from '@nestjs/testing';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import request from 'supertest';

import { IMAGE_STORAGE, type ImageStorage } from './image-storage';
import { LocalImageStorage } from './local-image-storage';
import { MediaController } from './media.controller';
import { S3ImageStorage } from './s3-image-storage';

describe('MediaController HTTP responses', () => {
  let temporaryRoot: string | undefined;

  afterEach(async () => {
    if (temporaryRoot !== undefined) {
      await rm(temporaryRoot, { force: true, recursive: true });
      temporaryRoot = undefined;
    }
  });

  async function createApp(storage: ImageStorage) {
    const module = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: IMAGE_STORAGE, useValue: storage }],
    }).compile();
    const app = module.createNestApplication();
    // Mirrors configureApplication(): Controller('media') is public at /api/media.
    app.setGlobalPrefix('api');
    await app.init();
    return app;
  }

  it('streams legacy jpg and png local fixtures through /api/media with response headers', async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'dau-vo-media-http-'));
    const storage = new LocalImageStorage(temporaryRoot);
    const jpgKey = 'organizations/123e4567-e89b-12d3-a456-426614174000.jpg';
    const pngKey = 'athletes/123e4567-e89b-12d3-a456-426614174001.png';
    const fixtures: readonly [string, Buffer][] = [
      [jpgKey, Buffer.from('legacy jpg')],
      [pngKey, Buffer.from('legacy png')],
    ];
    await Promise.all(
      fixtures.map(async ([key, body]) => {
        const file = path.join(temporaryRoot!, key);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body);
      }),
    );
    const app = await createApp(storage);

    try {
      const expectedResponses: readonly [string, string, string][] = [
        [jpgKey, 'image/jpeg', '10'],
        [pngKey, 'image/png', '10'],
      ];
      for (const [key, contentType, length] of expectedResponses) {
        const response = await request(app.getHttpServer())
          .get(`/api/media/${key}`)
          .expect(200);
        expect(response.headers).toMatchObject({
          'cache-control': 'public, max-age=31536000, immutable',
          'content-type': contentType,
          'content-length': length,
          'x-content-type-options': 'nosniff',
        });
      }
      await request(app.getHttpServer())
        .get('/api/media/athletes/123e4567-e89b-12d3-a456-426614174002.png')
        .expect(404)
        .expect('X-Content-Type-Options', 'nosniff');
    } finally {
      await app.close();
    }
  });

  it('streams legacy jpg and png S3 fixtures through the same API URL', async () => {
    const objects = new Map([
      [
        'organizations/123e4567-e89b-12d3-a456-426614174000.jpg',
        Buffer.from('legacy jpg'),
      ],
      [
        'athletes/123e4567-e89b-12d3-a456-426614174001.png',
        Buffer.from('legacy png'),
      ],
    ]);
    const client = {
      send: jest.fn(async (command: { input: { Key: string } }) => {
        const body = objects.get(command.input.Key);
        if (body === undefined)
          throw { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } };
        return { Body: Readable.from(body), ContentLength: body.length };
      }),
    };
    const storage = new S3ImageStorage(
      'private-images',
      'ap-southeast-1',
      client,
    );
    const app = await createApp(storage);

    try {
      const expectedResponses: readonly [string, string][] = [
        [
          'organizations/123e4567-e89b-12d3-a456-426614174000.jpg',
          'image/jpeg',
        ],
        ['athletes/123e4567-e89b-12d3-a456-426614174001.png', 'image/png'],
      ];
      for (const [key, contentType] of expectedResponses) {
        await request(app.getHttpServer())
          .get(`/api/media/${key}`)
          .expect(200)
          .expect('Content-Type', contentType)
          .expect('Content-Length', '10')
          .expect('Cache-Control', 'public, max-age=31536000, immutable')
          .expect('X-Content-Type-Options', 'nosniff');
      }
      await request(app.getHttpServer())
        .get('/api/media/tournaments/123e4567-e89b-12d3-a456-426614174002.jpg')
        .expect(404);
    } finally {
      await app.close();
    }
  });

  it('returns a server error rather than a false 404 when S3 denies GetObject', async () => {
    const storage = new S3ImageStorage('private-images', 'ap-southeast-1', {
      send: jest.fn().mockRejectedValue({
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    });
    const app = await createApp(storage);

    try {
      await request(app.getHttpServer())
        .get('/api/media/athletes/123e4567-e89b-12d3-a456-426614174001.png')
        .expect(500)
        .expect('X-Content-Type-Options', 'nosniff');
    } finally {
      await app.close();
    }
  });

  it('returns an uncacheable server error when an opened object stream fails', async () => {
    const storage: ImageStorage = {
      delete: jest.fn(),
      save: jest.fn(),
      open: jest.fn().mockResolvedValue({
        key: 'athletes/123e4567-e89b-12d3-a456-426614174001.webp',
        contentType: 'image/webp',
        contentLength: 1,
        stream: new Readable({
          read() {
            this.destroy(new Error('S3 stream interrupted'));
          },
        }),
      }),
    };
    const app = await createApp(storage);

    try {
      const response = await request(app.getHttpServer())
        .get('/api/media/athletes/123e4567-e89b-12d3-a456-426614174001.webp')
        .expect(500);
      expect(response.headers['cache-control']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
