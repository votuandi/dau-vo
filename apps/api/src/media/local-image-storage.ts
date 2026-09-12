import {
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ImageContentType,
  ImageInput,
  ImageResource,
  ImageStorage,
  OpenedImage,
  StoredImage,
} from './image-storage';
import {
  IMAGE_INVALID_CONTENT,
  IMAGE_STORAGE_FAILURE,
  IMAGE_TOO_LARGE,
  IMAGE_UNSUPPORTED_TYPE,
} from './media.errors';
import { IMAGE_MAX_BYTES } from './image-storage';

const TYPES: Record<
  ImageContentType,
  { extension: string; valid: (b: Buffer) => boolean }
> = {
  'image/jpeg': {
    extension: 'jpg',
    valid: (b) =>
      b.length >= 4 &&
      b[0] === 0xff &&
      b[1] === 0xd8 &&
      b[2] === 0xff &&
      b[b.length - 2] === 0xff &&
      b[b.length - 1] === 0xd9,
  },
  'image/png': {
    extension: 'png',
    valid: (b) =>
      b.length >= 20 &&
      b
        .subarray(0, 8)
        .equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ) &&
      b.subarray(b.length - 8, b.length - 4).toString('ascii') === 'IEND',
  },
  'image/webp': {
    extension: 'webp',
    valid: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP' &&
      b.readUInt32LE(4) + 8 === b.length,
  },
};
const RESOURCES = new Set<ImageResource>([
  'tournaments',
  'organizations',
  'athletes',
]);
const KEY =
  /^(tournaments|organizations|athletes)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export class LocalImageStorage implements ImageStorage {
  constructor(private readonly root: string) {}

  async save(input: ImageInput): Promise<StoredImage> {
    if (input.buffer.length > IMAGE_MAX_BYTES)
      throw new PayloadTooLargeException(IMAGE_TOO_LARGE);
    const contentType =
      input.declaredContentType.toLowerCase() as ImageContentType;
    const format = TYPES[contentType];
    if (format === undefined)
      throw new BadRequestException(IMAGE_UNSUPPORTED_TYPE);
    if (!format.valid(input.buffer))
      throw new BadRequestException(IMAGE_INVALID_CONTENT);
    if (!RESOURCES.has(input.resource))
      throw new BadRequestException(IMAGE_INVALID_CONTENT);
    const key = `${input.resource}/${randomUUID()}.${format.extension}`;
    try {
      const destination = this.resolve(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, input.buffer, { flag: 'wx', mode: 0o644 });
      return { contentLength: input.buffer.length, contentType, key };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof PayloadTooLargeException
      )
        throw error;
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    }
  }

  async open(key: string): Promise<OpenedImage | null> {
    if (!KEY.test(key)) return null;
    try {
      const destination = this.resolve(key);
      const info = await stat(destination);
      if (!info.isFile()) return null;
      const match = KEY.exec(key);
      if (match === null) return null;
      const extension = match[2];
      const contentType: ImageContentType =
        extension === 'jpg'
          ? 'image/jpeg'
          : extension === 'png'
            ? 'image/png'
            : 'image/webp';
      return {
        contentLength: info.size,
        contentType,
        key,
        stream: createReadStream(destination),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    }
  }

  private resolve(key: string): string {
    if (!KEY.test(key))
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    const resolved = path.resolve(this.root, key);
    const root = path.resolve(this.root) + path.sep;
    if (!resolved.startsWith(root))
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    return resolved;
  }
}
