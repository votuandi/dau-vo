import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import { LocalStore, localPath, parity, S3Store } from './storage-migration';

describe('storage migration primitives', () => {
  const key = 'athletes/11111111-1111-1111-1111-111111111111.jpg';

  it('inspects legacy JPEG bytes without changing them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'media-migration-'));
    const filename = localPath(root, key);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const before = await new LocalStore(root).inspect(key, true);
    const after = await new LocalStore(root).inspect(key, true);
    expect(before).toEqual(after);
    expect(before).toMatchObject({ exists: true, size: 4 });
  });

  it('rejects traversal and keys outside the media contract before filesystem access', () => {
    expect(() => localPath('C:\\uploads', '../secrets.jpg')).toThrow(
      'unsafe storage key',
    );
    expect(() => localPath('C:\\uploads', 'athletes/not-a-uuid.webp')).toThrow(
      'unsafe storage key',
    );
  });

  it('distinguishes absent destinations from equal and conflicting objects', () => {
    const source = { exists: true, size: 3, sha256: 'abc' };
    expect(parity(source, { exists: false })).toBe('copy');
    expect(parity(source, { exists: true, size: 3, sha256: 'abc' })).toBe(
      'equal',
    );
    expect(parity(source, { exists: true, size: 3, sha256: 'def' })).toBe(
      'conflict',
    );
    expect(parity({ exists: false }, { exists: false })).toBe('missing-source');
    expect(parity(source, { exists: false, error: 'S3 HEAD 403' })).toBe(
      'unsafe',
    );
  });

  it('proves a missing S3 destination with an authorized empty exact-key listing', async () => {
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        throw { name: 'NotFound', $metadata: { httpStatusCode: 404 } };
      expect(command).toBeInstanceOf(ListObjectsV2Command);
      expect((command as ListObjectsV2Command).input).toMatchObject({
        Bucket: 'media',
        Prefix: key,
      });
      return { Contents: [] };
    });
    const destination = await new S3Store('media', { send }).inspect(key, true);

    expect(destination).toEqual({ exists: false });
    expect(parity({ exists: true, size: 3, sha256: 'abc' }, destination)).toBe(
      'copy',
    );
  });

  it('inspects an S3 HEAD success with size and requested SHA-256', async () => {
    const bytes = Buffer.from('same bytes');
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        return { ContentLength: bytes.length };
      if (command instanceof GetObjectCommand)
        return { Body: Readable.from(bytes) };
      throw new Error('unexpected command');
    });
    await expect(
      new S3Store('media', { send }).inspect(key, true),
    ).resolves.toEqual({
      exists: true,
      size: bytes.length,
      sha256:
        '58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb',
    });
  });

  it('uses an exact listed key after a HEAD 404 and hashes its content', async () => {
    const bytes = Buffer.from('same bytes');
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        throw { name: 'NotFound', $metadata: { httpStatusCode: 404 } };
      if (command instanceof ListObjectsV2Command)
        return { Contents: [{ Key: key, Size: bytes.length }] };
      if (command instanceof GetObjectCommand)
        return { Body: Readable.from(bytes) };
      throw new Error('unexpected command');
    });

    await expect(
      new S3Store('media', { send }).inspect(key, true),
    ).resolves.toEqual({
      exists: true,
      size: bytes.length,
      sha256:
        '58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb',
    });
  });

  it('does not treat a longer listed key as the missing key', async () => {
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        throw { name: 'NotFound', $metadata: { httpStatusCode: 404 } };
      return { Contents: [{ Key: `${key}.bak`, Size: 3 }] };
    });
    await expect(
      new S3Store('media', { send }).inspect(key, false),
    ).resolves.toEqual({
      exists: false,
    });
  });

  it('keeps a malformed listing unsafe', async () => {
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        throw { name: 'NotFound', $metadata: { httpStatusCode: 404 } };
      return { Contents: 'not-an-array' };
    });
    const result = await new S3Store('media', { send }).inspect(key, false);
    expect(result).toMatchObject({
      exists: false,
      errorCategory: 'inspection-error',
    });
    expect(parity({ exists: true, size: 3 }, result)).toBe('unsafe');
  });

  it.each([
    [
      'NoSuchBucket',
      { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } },
      'bucket-not-found',
    ],
    [
      'HEAD access denied',
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
      'access-denied',
    ],
  ])('keeps %s unsafe', async (_label, failure, category) => {
    const send = jest.fn(async () => {
      throw failure;
    });
    const result = await new S3Store('media', { send }).inspect(key, false);
    expect(result).toMatchObject({ exists: false, errorCategory: category });
    expect(parity({ exists: true, size: 3 }, result)).toBe('unsafe');
  });

  it.each([
    [
      'listing access denied',
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
      'access-denied',
    ],
    [
      'wrong region',
      { name: 'PermanentRedirect', $metadata: { httpStatusCode: 301 } },
      'wrong-region',
    ],
    ['timeout', new Error('timeout'), 'inspection-error'],
    [
      'throttling',
      { name: 'SlowDown', $metadata: { httpStatusCode: 503 } },
      'inspection-error',
    ],
  ])('keeps %s after HEAD 404 unsafe', async (_label, failure, category) => {
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        throw { name: 'NotFound', $metadata: { httpStatusCode: 404 } };
      throw failure;
    });
    const result = await new S3Store('media', { send }).inspect(key, false);
    expect(result).toMatchObject({ exists: false, errorCategory: category });
    expect(parity({ exists: true, size: 3 }, result)).toBe('unsafe');
  });
});
