import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { InternalServerErrorException } from '@nestjs/common';
import { Readable } from 'node:stream';

import type {
  ImageInput,
  ImageStorage,
  OpenedImage,
  StoredImage,
} from './image-storage';
import { IMAGE_STORAGE_FAILURE } from './media.errors';
import {
  canonicalizeImage,
  imageContentTypeForKey,
  isValidImageStorageKey,
} from './image-storage-validation';

type S3ClientLike = Pick<S3Client, 'send'>;

/** Private-object S3 implementation; callers stream bytes through this API. */
export class S3ImageStorage implements ImageStorage {
  private readonly client: S3ClientLike;

  constructor(
    private readonly bucket: string,
    region: string,
    client?: S3ClientLike,
  ) {
    // Deliberately use the SDK default credential provider chain. This supports
    // instance/task roles as well as standard local profiles and environment.
    this.client = client ?? new S3Client({ region });
  }

  async save(input: ImageInput): Promise<StoredImage> {
    const canonical = await canonicalizeImage(input);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: canonical.key,
          Body: canonical.buffer,
          ContentType: canonical.contentType,
          ContentLength: canonical.contentLength,
        }),
      );
      return {
        contentLength: canonical.contentLength,
        contentType: canonical.contentType,
        key: canonical.key,
      };
    } catch {
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    }
  }

  async open(key: string): Promise<OpenedImage | null> {
    if (!isValidImageStorageKey(key)) return null;
    const contentType = imageContentTypeForKey(key);
    if (contentType === null) return null;
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!isNodeReadable(object.Body))
        throw new Error('S3 response did not contain a Node readable stream');
      if (
        typeof object.ContentLength !== 'number' ||
        !Number.isSafeInteger(object.ContentLength) ||
        object.ContentLength < 0
      )
        throw new Error('S3 response did not contain a valid content length');
      return {
        key,
        // Keys are the stable media contract; this also preserves legacy JPG
        // and PNG records if their historical S3 metadata is incomplete.
        contentType,
        contentLength: object.ContentLength,
        stream: object.Body,
      };
    } catch (error) {
      if (isConfirmedMissingObject(error)) return null;
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    }
  }

  async delete(key: string): Promise<void> {
    if (!isValidImageStorageKey(key))
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    try {
      // S3 DeleteObject is idempotent, including for an already absent key.
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    }
  }
}

function isNodeReadable(value: unknown): value is Readable {
  return value instanceof Readable;
}

function isConfirmedMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
