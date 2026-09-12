import type { Readable } from 'node:stream';

export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type ImageResource = 'tournaments' | 'organizations' | 'athletes';
export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageInput {
  buffer: Buffer;
  declaredContentType: string;
  resource: ImageResource;
}

export interface StoredImage {
  contentLength: number;
  contentType: ImageContentType;
  key: string;
}

export interface OpenedImage extends StoredImage {
  stream: Readable;
}

/** Object-key based port; an S3 adapter can implement this without controller changes. */
export interface ImageStorage {
  save(input: ImageInput): Promise<StoredImage>;
  open(key: string): Promise<OpenedImage | null>;
  delete(key: string): Promise<void>;
}
