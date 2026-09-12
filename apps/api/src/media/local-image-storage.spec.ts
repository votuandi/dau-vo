import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { LocalImageStorage } from './local-image-storage';
import { IMAGE_MAX_BYTES } from './image-storage';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
  Buffer.from('IEND'),
  Buffer.alloc(4),
]);
const webp = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

describe('LocalImageStorage', () => {
  let root: string;
  let storage: LocalImageStorage;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'dau-vo-media-'));
    storage = new LocalImageStorage(root);
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });
  it.each([
    [jpeg, 'image/jpeg'],
    [png, 'image/png'],
    [webp, 'image/webp'],
  ] as const)(
    'stores and opens a valid %s image',
    async (buffer, declaredContentType) => {
      const stored = await storage.save({
        buffer,
        declaredContentType,
        resource: 'tournaments',
      });
      expect(stored.key).toMatch(
        /^tournaments\/[0-9a-f-]{36}\.(jpg|png|webp)$/,
      );
      const opened = await storage.open(stored.key);
      expect(opened).toMatchObject({
        contentLength: buffer.length,
        contentType: declaredContentType,
      });
      opened?.stream.destroy();
    },
  );
  it('enforces exactly the 2 MiB boundary', async () => {
    const atLimit = Buffer.concat([
      jpeg,
      Buffer.alloc(IMAGE_MAX_BYTES - jpeg.length - 2),
      Buffer.from([0xff, 0xd9]),
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
  it('rejects MIME/signature mismatches, SVG, malformed files, and traversal', async () => {
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
    await expect(
      storage.save({
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        declaredContentType: 'image/jpeg',
        resource: 'tournaments',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.open('../secret.jpg')).resolves.toBeNull();
    await expect(
      storage.delete('tournaments/does-not-exist.jpg'),
    ).rejects.toBeDefined();
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
});
