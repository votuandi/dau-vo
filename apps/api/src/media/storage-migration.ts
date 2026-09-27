import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

import {
  imageContentTypeForKey,
  isValidImageStorageKey,
} from './image-storage-validation';

export type Direction = 'forward' | 'reverse';
export type ObjectInfo = {
  exists: boolean;
  size?: number;
  sha256?: string;
  error?: string;
  /** Stable, non-sensitive reason an inspection could not prove an outcome. */
  errorCategory?:
    | 'missing'
    | 'access-denied'
    | 'bucket-not-found'
    | 'wrong-region'
    | 'ambiguous'
    | 'inspection-error';
};
export type ObjectStore = {
  inspect(key: string, withHash: boolean): Promise<ObjectInfo>;
  copyFrom(key: string, source: ObjectStore): Promise<void>;
};

/** Resolves only keys accepted by the application, before touching disk. */
export function localPath(root: string, key: string): string {
  if (!isValidImageStorageKey(key))
    throw new Error(`unsafe storage key: ${key}`);
  const resolved = path.resolve(root, key);
  const base = path.resolve(root) + path.sep;
  if (!resolved.startsWith(base)) throw new Error(`unsafe storage key: ${key}`);
  return resolved;
}

async function hashStream(stream: Readable): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export class LocalStore implements ObjectStore {
  constructor(private readonly root: string) {}
  filename(key: string): string {
    return localPath(this.root, key);
  }
  async inspect(key: string, withHash: boolean): Promise<ObjectInfo> {
    try {
      const filename = this.filename(key);
      const info = await stat(filename);
      if (!info.isFile())
        return {
          exists: false,
          error: 'not a regular file',
          errorCategory: 'inspection-error',
        };
      return {
        exists: true,
        size: info.size,
        ...(withHash
          ? { sha256: await hashStream(createReadStream(filename)) }
          : {}),
      };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? { exists: false }
        : {
            exists: false,
            error:
              error instanceof Error
                ? error.message
                : 'local inspection failed',
            errorCategory: 'inspection-error',
          };
    }
  }
  async copyFrom(key: string, source: ObjectStore): Promise<void> {
    if (!(source instanceof S3Store))
      throw new Error('local copy source must be S3');
    const expected = await source.inspect(key, true);
    if (!expected.exists || expected.size === undefined || !expected.sha256)
      throw new Error(`source cannot be verified: ${key}`);
    const destination = this.filename(key);
    await mkdir(path.dirname(destination), { recursive: true });
    const existing = await this.inspect(key, true);
    if (existing.exists) {
      if (parity(expected, existing) === 'equal') return;
      throw new Error(`destination conflict: ${key}`);
    }
    if (existing.error)
      throw new Error(`destination cannot be inspected: ${key}`);

    // A sibling staging name is not a valid media key, so it cannot be served
    // by /api/media. A hard kill may leave one behind, but never a partial key.
    const temporary = path.join(
      path.dirname(destination),
      `.storage-migration-tmp-${process.pid}-${randomUUID()}`,
    );
    let syncHandle: Awaited<ReturnType<typeof open>> | undefined;
    let temporaryCreated = false;
    try {
      const hash = createHash('sha256');
      let size = 0;
      const verifier = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          hash.update(bytes);
          callback(null, bytes);
        },
      });
      const body = await source.openRead(key);
      const staging = createWriteStream(temporary, {
        flags: 'wx',
        mode: 0o600,
      });
      await new Promise<void>((resolve, reject) => {
        staging.once('open', () => resolve()).once('error', reject);
      });
      temporaryCreated = true;
      await pipeline(body, verifier, staging);
      syncHandle = await open(temporary, 'r+');
      await syncHandle.sync();
      await syncHandle.close();
      syncHandle = undefined;

      if (size !== expected.size || hash.digest('hex') !== expected.sha256)
        throw new Error(`source changed or copy verification failed: ${key}`);

      // link(2)/CreateHardLink is atomic and fails if destination already
      // exists. Unlike rename it cannot replace a concurrently-created file.
      try {
        await link(temporary, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
          throw new Error(
            `atomic no-clobber publish failed for ${key} (${code}); refusing to overwrite`,
          );
        }
        const winner = await this.inspect(key, true);
        if (parity(expected, winner) === 'equal') return;
        throw new Error(`destination conflict: ${key}`);
      }
    } finally {
      if (syncHandle !== undefined)
        await syncHandle.close().catch(() => undefined);
      if (temporaryCreated)
        await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

export class S3Store implements ObjectStore {
  constructor(
    private readonly bucket: string,
    private readonly client: Pick<S3Client, 'send'>,
  ) {}
  async inspect(key: string, withHash: boolean): Promise<ObjectInfo> {
    if (!isValidImageStorageKey(key))
      return {
        exists: false,
        error: 'unsafe storage key',
        errorCategory: 'inspection-error',
      };
    let head;
    try {
      head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      // HeadObject alone cannot distinguish a missing key from a missing bucket
      // (and may return 403 when ListBucket is absent). Only a successful,
      // prefix-scoped list can prove absence after a 404-class HEAD response.
      if (!isNotFound(error)) return s3InspectionError(error);
      return this.inspectAfterNotFound(key, withHash);
    }
    if (typeof head.ContentLength !== 'number')
      return {
        exists: false,
        error: 'S3 HEAD response has no ContentLength',
        errorCategory: 'inspection-error',
      };
    return this.inspectKnownObject(key, head.ContentLength, withHash);
  }

  private async inspectAfterNotFound(
    key: string,
    withHash: boolean,
  ): Promise<ObjectInfo> {
    try {
      const listed = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: key }),
      );
      if (listed.Contents !== undefined && !Array.isArray(listed.Contents))
        return {
          exists: false,
          error: 'malformed S3 listing response',
          errorCategory: 'inspection-error',
        };
      const exact = listed.Contents?.find((object) => object.Key === key);
      // A successful list for this exact key prefix validates both the bucket
      // and the migration identity's prefix scope. Longer keys do not count.
      if (exact === undefined) return { exists: false };
      if (typeof exact.Size !== 'number')
        return {
          exists: false,
          error: 'S3 listing response has no object size',
          errorCategory: 'inspection-error',
        };
      return this.inspectKnownObject(key, exact.Size, withHash);
    } catch (error) {
      return s3InspectionError(error);
    }
  }

  private async inspectKnownObject(
    key: string,
    size: number,
    withHash: boolean,
  ): Promise<ObjectInfo> {
    try {
      return {
        exists: true,
        size,
        ...(withHash ? { sha256: await this.hash(key) } : {}),
      };
    } catch (error) {
      return s3InspectionError(error);
    }
  }
  async read(key: string): Promise<Buffer> {
    const body = await this.openRead(key);
    return Buffer.concat(
      await (async () => {
        const out: Buffer[] = [];
        for await (const x of body) out.push(Buffer.from(x));
        return out;
      })(),
    );
  }
  async openRead(key: string): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = result.Body;
    if (!(body instanceof Readable))
      throw new Error(`S3 object is not readable: ${key}`);
    return body;
  }
  private async hash(key: string): Promise<string> {
    return createHash('sha256')
      .update(await this.read(key))
      .digest('hex');
  }
  async copyFrom(key: string, source: ObjectStore): Promise<void> {
    if (!(source instanceof LocalStore))
      throw new Error('S3 copy source must be local');
    const filename = source.filename(key);
    const contentType = imageContentTypeForKey(key);
    if (contentType === null) throw new Error(`unsupported key: ${key}`);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filename),
        ContentType: contentType,
        ContentLength: (await stat(filename)).size,
      }),
    );
  }
}

type S3Failure = {
  name?: string;
  Code?: string;
  code?: string;
  $metadata?: { httpStatusCode?: number };
};

function isNotFound(error: unknown): boolean {
  const failure = error as S3Failure;
  return (
    failure?.$metadata?.httpStatusCode === 404 &&
    failure.name !== 'NoSuchBucket' &&
    failure.Code !== 'NoSuchBucket' &&
    failure.code !== 'NoSuchBucket'
  );
}

function s3InspectionError(error: unknown): ObjectInfo {
  const failure = error as S3Failure;
  const code = failure?.name ?? failure?.Code ?? failure?.code;
  const status = failure?.$metadata?.httpStatusCode;
  const errorCategory =
    code === 'NoSuchBucket'
      ? 'bucket-not-found'
      : status === 301 || code === 'PermanentRedirect'
        ? 'wrong-region'
        : status === 403 || code === 'AccessDenied'
          ? 'access-denied'
          : status === 404
            ? 'ambiguous'
            : 'inspection-error';
  return {
    exists: false,
    error: `S3 inspection ${errorCategory}`,
    errorCategory,
  };
}

export function parity(
  source: ObjectInfo,
  destination: ObjectInfo,
): 'copy' | 'equal' | 'conflict' | 'missing-source' | 'unsafe' {
  if (source.error || destination.error) return 'unsafe';
  if (!source.exists) return 'missing-source';
  if (!destination.exists) return 'copy';
  if (source.size !== destination.size) return 'conflict';
  return source.sha256 === undefined ||
    destination.sha256 === undefined ||
    source.sha256 === destination.sha256
    ? 'equal'
    : 'conflict';
}
