import {
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

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

const MAX_PIXELS = 16_000_000;
const TYPES: Record<ImageContentType, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
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
    const expectedFormat = TYPES[contentType];
    if (expectedFormat === undefined)
      throw new BadRequestException(IMAGE_UNSUPPORTED_TYPE);
    if (!RESOURCES.has(input.resource))
      throw new BadRequestException(IMAGE_INVALID_CONTENT);
    let canonical: Buffer;
    try {
      // Decode pixels (not just headers), cap decompression work at 16 MP, and
      // re-encode to a single safe representation that strips metadata/tails.
      const metadata = await sharp(input.buffer, {
        limitInputPixels: MAX_PIXELS,
        failOn: 'error',
      }).metadata();
      if (
        metadata.format !== expectedFormat ||
        containsActivePayload(input.buffer)
      )
        throw new Error('invalid image');
      canonical = await sharp(input.buffer, {
        limitInputPixels: MAX_PIXELS,
        failOn: 'error',
      })
        .rotate()
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
    } catch {
      throw new BadRequestException(IMAGE_INVALID_CONTENT);
    }
    if (canonical.length > IMAGE_MAX_BYTES)
      throw new PayloadTooLargeException(IMAGE_TOO_LARGE);
    const key = `${input.resource}/${randomUUID()}.webp`;
    try {
      const destination = this.resolve(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, canonical, { flag: 'wx', mode: 0o644 });
      return {
        contentLength: canonical.length,
        contentType: 'image/webp',
        key,
      };
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

function containsActivePayload(buffer: Buffer): boolean {
  // Canonicalization removes benign metadata. Reject unmistakable executable
  // markup explicitly so an image-plus-HTML/script polyglot is never accepted.
  return /<(?:script|html|svg)\b|<\?php/i.test(buffer.toString('latin1'));
}
