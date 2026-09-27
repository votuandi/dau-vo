import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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
      if (!info.isFile()) return { exists: false, error: 'not a regular file' };
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
          };
    }
  }
  async copyFrom(key: string, source: ObjectStore): Promise<void> {
    if (!(source instanceof S3Store))
      throw new Error('local copy source must be S3');
    const bytes = await source.read(key);
    const destination = this.filename(key);
    await mkdir(path.dirname(destination), { recursive: true });
    // A copy never silently overwrites a non-identical destination.
    try {
      await access(destination);
      throw new Error(`destination already exists: ${key}`);
    } catch (e) {
      if (!(e as NodeJS.ErrnoException).code?.includes('ENOENT')) throw e;
    }
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o644 });
  }
}

export class S3Store implements ObjectStore {
  constructor(
    private readonly bucket: string,
    private readonly client: Pick<S3Client, 'send'>,
  ) {}
  async inspect(key: string, withHash: boolean): Promise<ObjectInfo> {
    if (!isValidImageStorageKey(key))
      return { exists: false, error: `unsafe storage key: ${key}` };
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (typeof head.ContentLength !== 'number')
        return { exists: false, error: 'S3 response has no ContentLength' };
      return {
        exists: true,
        size: head.ContentLength,
        ...(withHash ? { sha256: await this.hash(key) } : {}),
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      // A 403 can mean either denied or absent without ListBucket; never call it missing.
      return {
        exists: false,
        error:
          status === 403
            ? 'S3 HEAD 403 (ambiguous: require ListBucket)'
            : error instanceof Error
              ? error.message
              : 'S3 inspection failed',
      };
    }
  }
  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = result.Body;
    if (!(body instanceof Readable))
      throw new Error(`S3 object is not readable: ${key}`);
    return Buffer.concat(
      await (async () => {
        const out: Buffer[] = [];
        for await (const x of body) out.push(Buffer.from(x));
        return out;
      })(),
    );
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
