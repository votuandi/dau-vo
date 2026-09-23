import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGE_MAX_BYTES } from './image-storage';
import {
  imageContentTypeForKey,
  isValidImageStorageKey,
} from './image-storage-validation';
import { LocalImageStorage } from './local-image-storage';

describe('LocalImageStorage', () => {
  let root: string;
  let storage: LocalImageStorage;
  let jpeg: Buffer;
  let png: Buffer;
  let webp: Buffer;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'dau-vo-media-'));
    storage = new LocalImageStorage(root);
    [jpeg, png, webp] = await Promise.all([
      sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
        .jpeg()
        .toBuffer(),
      sharp({
        create: { width: 2, height: 2, channels: 4, background: 'blue' },
      })
        .png()
        .toBuffer(),
      sharp({
        create: { width: 2, height: 2, channels: 3, background: 'green' },
      })
        .webp()
        .toBuffer(),
    ]);
  });
  afterEach(async () => rm(root, { force: true, recursive: true }));

  it.each([
    [() => jpeg, 'image/jpeg'],
    [() => png, 'image/png'],
    [() => webp, 'image/webp'],
  ] as const)(
    'decodes and canonicalizes valid %s input',
    async (fixture, declaredContentType) => {
      const stored = await storage.save({
        buffer: fixture(),
        declaredContentType,
        resource: 'tournaments',
      });
      expect(stored).toMatchObject({ contentType: 'image/webp' });
      expect(stored.key).toMatch(/^tournaments\/[0-9a-f-]{36}\.webp$/);
      const disk = await readFile(path.join(root, stored.key));
      expect((await sharp(disk).metadata()).format).toBe('webp');
      const opened = await storage.open(stored.key);
      expect(opened).toMatchObject({
        contentLength: disk.length,
        contentType: 'image/webp',
      });
      opened?.stream.destroy();
    },
  );

  it('enforces its exact 2 MiB input boundary', async () => {
    const atLimit = Buffer.concat([
      jpeg,
      Buffer.alloc(IMAGE_MAX_BYTES - jpeg.length),
    ]);
    await expect(
      storage.save({
        buffer: atLimit,
        declaredContentType: 'image/jpeg',
        resource: 'tournaments',
      }),
    ).resolves.toBeDefined();
    await expect(
      storage.save({
        buffer: Buffer.concat([atLimit, Buffer.from([0])]),
        declaredContentType: 'image/jpeg',
        resource: 'tournaments',
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects fake, corrupt, mismatched, polyglot, oversized-pixel, and traversal input', async () => {
    for (const buffer of [
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      jpeg.subarray(0, 10),
      Buffer.concat([jpeg, Buffer.from('<script>alert(1)</script>')]),
    ]) {
      await expect(
        storage.save({
          buffer,
          declaredContentType: 'image/jpeg',
          resource: 'tournaments',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      storage.save({
        buffer: png,
        declaredContentType: 'image/jpeg',
        resource: 'tournaments',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.save({
        buffer: Buffer.from('<svg/>'),
        declaredContentType: 'image/svg+xml',
        resource: 'tournaments',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const huge = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: 'black' },
    })
      .png()
      .toBuffer();
    await expect(
      storage.save({
        buffer: huge,
        declaredContentType: 'image/png',
        resource: 'tournaments',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.open('../secret.jpg')).resolves.toBeNull();
  });

  it('deletes idempotently', async () => {
    const stored = await storage.save({
      buffer: jpeg,
      declaredContentType: 'image/jpeg',
      resource: 'tournaments',
    });
    await storage.delete(stored.key);
    await expect(storage.delete(stored.key)).resolves.toBeUndefined();
  });

  it('uses the shared validator for legacy keys and rejects malformed keys', async () => {
    const legacyJpegKey =
      'organizations/123e4567-e89b-12d3-a456-426614174000.jpg';
    const legacyPngKey = 'athletes/123e4567-e89b-12d3-a456-426614174000.png';
    expect(isValidImageStorageKey(legacyJpegKey)).toBe(true);
    expect(imageContentTypeForKey(legacyJpegKey)).toBe('image/jpeg');
    expect(imageContentTypeForKey(legacyPngKey)).toBe('image/png');
    for (const key of [
      '../secret.jpg',
      'tournaments/../secret.jpg',
      'unknown/123e4567-e89b-12d3-a456-426614174000.webp',
      'tournaments/not-a-uuid.webp',
    ]) {
      expect(isValidImageStorageKey(key)).toBe(false);
      await expect(storage.open(key)).resolves.toBeNull();
    }
  });
});
