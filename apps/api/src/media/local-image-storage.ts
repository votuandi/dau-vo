import { InternalServerErrorException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

export class LocalImageStorage implements ImageStorage {
  constructor(private readonly root: string) {}

  async save(input: ImageInput): Promise<StoredImage> {
    const canonical = await canonicalizeImage(input);
    try {
      const destination = this.resolve(canonical.key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, canonical.buffer, {
        flag: 'wx',
        mode: 0o644,
      });
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
    try {
      const destination = this.resolve(key);
      const info = await stat(destination);
      if (!info.isFile()) return null;
      const contentType = imageContentTypeForKey(key);
      if (contentType === null) return null;
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
    if (!isValidImageStorageKey(key))
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    const resolved = path.resolve(this.root, key);
    const root = path.resolve(this.root) + path.sep;
    if (!resolved.startsWith(root))
      throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
    return resolved;
  }
}
