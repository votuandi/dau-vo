import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

  function fakeS3(bytes: Buffer, copyBody?: () => Readable): S3Store {
    let reads = 0;
    return new S3Store('media', {
      send: jest.fn(async (command: unknown) => {
        if (command instanceof HeadObjectCommand)
          return { ContentLength: bytes.length };
        if (command instanceof GetObjectCommand) {
          reads += 1;
          return {
            Body:
              reads === 1
                ? Readable.from(bytes)
                : (copyBody?.() ?? Readable.from(bytes)),
          };
        }
        throw new Error('unexpected command');
      }),
    });
  }

  async function destinationFiles(root: string): Promise<string[]> {
    return readdir(path.dirname(localPath(root, key)));
  }

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

  it('reverse-copies exact bytes through a staged file and atomically publishes the key', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'media-migration-'));
    const bytes = Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd9]);
    const source = fakeS3(bytes);

    await new LocalStore(root).copyFrom(key, source);

    expect(await readFile(localPath(root, key))).toEqual(bytes);
    expect(await destinationFiles(root)).toEqual([
      path.basename(localPath(root, key)),
    ]);
  });

  it('does not publish a partial destination and cleans staging after a source stream fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'media-migration-'));
    const bytes = Buffer.from('complete image bytes');
    const source = fakeS3(bytes, () =>
      Readable.from(
        (async function* () {
          yield bytes.subarray(0, 5);
          throw new Error('simulated S3 stream failure');
        })(),
      ),
    );
    const local = new LocalStore(root);

    await expect(local.copyFrom(key, source)).rejects.toThrow(
      'simulated S3 stream failure',
    );
    expect(await local.inspect(key, true)).toEqual({ exists: false });
    expect(await destinationFiles(root)).toEqual([]);

    await local.copyFrom(key, fakeS3(bytes));
    expect(await readFile(localPath(root, key))).toEqual(bytes);
  });

  it('accepts an equal completed key and preserves a different key as a conflict', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'media-migration-'));
    const bytes = Buffer.from('source bytes');
    const local = new LocalStore(root);
    const filename = localPath(root, key);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes);
    await expect(local.copyFrom(key, fakeS3(bytes))).resolves.toBeUndefined();

    const different = Buffer.from('do not overwrite');
    await writeFile(filename, different);
    await expect(local.copyFrom(key, fakeS3(bytes))).rejects.toThrow(
      'destination conflict',
    );
    expect(await readFile(filename)).toEqual(different);
  });

  it('handles no-clobber publication races by accepting an equal winner and rejecting a different winner', async () => {
    const sameRoot = await mkdtemp(path.join(os.tmpdir(), 'media-migration-'));
    const bytes = Buffer.from('same competing bytes');
    const sameResults = await Promise.allSettled([
      new LocalStore(sameRoot).copyFrom(key, fakeS3(bytes)),
      new LocalStore(sameRoot).copyFrom(key, fakeS3(bytes)),
    ]);
    expect(sameResults.every((result) => result.status === 'fulfilled')).toBe(
      true,
    );
    expect(await readFile(localPath(sameRoot, key))).toEqual(bytes);

    const conflictRoot = await mkdtemp(
      path.join(os.tmpdir(), 'media-migration-'),
    );
    const conflictResults = await Promise.allSettled([
      new LocalStore(conflictRoot).copyFrom(key, fakeS3(Buffer.from('first'))),
      new LocalStore(conflictRoot).copyFrom(key, fakeS3(Buffer.from('second'))),
    ]);
    expect(
      conflictResults.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(await destinationFiles(conflictRoot)).toEqual([
      path.basename(localPath(conflictRoot, key)),
    ]);
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
