import {
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InternalServerErrorException } from '@nestjs/common';
import { Readable } from 'node:stream';
import sharp from 'sharp';

import { S3ImageStorage } from './s3-image-storage';

type StubS3Client = Pick<S3Client, 'send'>;

describe('S3ImageStorage', () => {
  let client: { send: jest.Mock };
  let storage: S3ImageStorage;
  let jpeg: Buffer;
  let png: Buffer;
  let webp: Buffer;

  beforeEach(async () => {
    client = { send: jest.fn() };
    storage = new S3ImageStorage(
      'private-images',
      'ap-southeast-1',
      client as unknown as StubS3Client,
    );
    [jpeg, png, webp] = await Promise.all([
      sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
        .jpeg()
        .toBuffer(),
      sharp({
        create: { width: 2, height: 2, channels: 3, background: 'blue' },
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

  it.each([
    [() => jpeg, 'image/jpeg'],
    [() => png, 'image/png'],
    [() => webp, 'image/webp'],
  ] as const)(
    'canonicalizes %s and stores its WebP bytes',
    async (fixture, type) => {
      client.send.mockResolvedValue({});
      const stored = await storage.save({
        buffer: fixture(),
        declaredContentType: type,
        resource: 'tournaments',
      });

      const command = client.send.mock.calls[0][0] as PutObjectCommand;
      expect(command.input).toMatchObject({
        Bucket: 'private-images',
        Key: stored.key,
        ContentType: 'image/webp',
        ContentLength: stored.contentLength,
      });
      expect(Buffer.isBuffer(command.input.Body)).toBe(true);
      expect(command.input.Body).toHaveLength(stored.contentLength);
      expect(
        (await sharp(command.input.Body as Buffer).metadata()).format,
      ).toBe('webp');
    },
  );

  it('returns an S3 node stream with key-derived legacy headers', async () => {
    const key = 'organizations/123e4567-e89b-12d3-a456-426614174000.jpg';
    const body = Readable.from(Buffer.from('jpeg bytes'));
    client.send.mockResolvedValue({ Body: body, ContentLength: 9 });

    const opened = await storage.open(key);
    expect(client.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect((client.send.mock.calls[0][0] as GetObjectCommand).input).toEqual({
      Bucket: 'private-images',
      Key: key,
    });
    expect(opened).toMatchObject({
      key,
      contentType: 'image/jpeg',
      contentLength: 9,
      stream: body,
    });
  });

  it('returns null only for a confirmed absent object, not AccessDenied', async () => {
    const key = 'athletes/123e4567-e89b-12d3-a456-426614174000.png';
    client.send.mockRejectedValueOnce({
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    });
    await expect(storage.open(key)).resolves.toBeNull();

    client.send.mockRejectedValueOnce({
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });
    await expect(storage.open(key)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('propagates failed puts as the project storage error', async () => {
    client.send.mockRejectedValue(new Error('network failure'));
    await expect(
      storage.save({
        buffer: jpeg,
        declaredContentType: 'image/jpeg',
        resource: 'athletes',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('uses idempotent DeleteObject and propagates unexpected delete errors', async () => {
    const key = 'tournaments/123e4567-e89b-12d3-a456-426614174000.webp';
    client.send.mockResolvedValue({});
    await expect(storage.delete(key)).resolves.toBeUndefined();
    expect(client.send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect((client.send.mock.calls[0][0] as DeleteObjectCommand).input).toEqual(
      {
        Bucket: 'private-images',
        Key: key,
      },
    );

    client.send.mockRejectedValue(new Error('network failure'));
    await expect(storage.delete(key)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('does not call S3 for invalid keys', async () => {
    await expect(storage.open('../secret.jpg')).resolves.toBeNull();
    await expect(storage.delete('../secret.jpg')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(client.send).not.toHaveBeenCalled();
  });
});
