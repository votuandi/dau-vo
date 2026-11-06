import {
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

import {
  IMAGE_INVALID_CONTENT,
  IMAGE_STORAGE_FAILURE,
  IMAGE_TOO_LARGE,
  IMAGE_UNSUPPORTED_TYPE,
} from './media.errors';
import {
  IMAGE_MAX_BYTES,
  type ImageContentType,
  type ImageInput,
  type ImageResource,
  type StoredImage,
} from './image-storage';

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

export interface CanonicalImage extends StoredImage {
  buffer: Buffer;
}

/** Validates the stable, provider-neutral object-key contract, including legacy suffixes. */
export function isValidImageStorageKey(key: string): boolean {
  return KEY.test(key);
}

export function imageContentTypeForKey(key: string): ImageContentType | null {
  const match = KEY.exec(key);
  if (match === null) return null;
  if (match[2] === 'jpg') return 'image/jpeg';
  if (match[2] === 'png') return 'image/png';
  return 'image/webp';
}

/**
 * Applies every image admission and canonicalization rule before a provider
 * writes anything. Providers must persist only this result.
 */
export async function canonicalizeImage(
  input: ImageInput,
): Promise<CanonicalImage> {
  if (input.buffer.length > IMAGE_MAX_BYTES)
    throw new PayloadTooLargeException(IMAGE_TOO_LARGE);
  const contentType =
    input.declaredContentType.toLowerCase() as ImageContentType;
  const expectedFormat = TYPES[contentType];
  if (expectedFormat === undefined)
    throw new BadRequestException(IMAGE_UNSUPPORTED_TYPE);
  if (!RESOURCES.has(input.resource))
    throw new BadRequestException(IMAGE_INVALID_CONTENT);

  let buffer: Buffer;
  try {
    // Decode pixels (not just headers), cap decompression work at 16 MP, and
    // re-encode to a single safe representation that strips metadata/tails.
    const metadata = await sharp(input.buffer, {
      limitInputPixels: MAX_PIXELS,
      failOn: 'error',
    }).metadata();
    if (
      metadata.format !== expectedFormat ||
      containsActivePayload(input.buffer, metadata.format)
    )
      throw new Error('invalid image');
    buffer = await sharp(input.buffer, {
      limitInputPixels: MAX_PIXELS,
      failOn: 'error',
    })
      .rotate()
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
  } catch {
    throw new BadRequestException(IMAGE_INVALID_CONTENT);
  }
  if (buffer.length > IMAGE_MAX_BYTES)
    throw new PayloadTooLargeException(IMAGE_TOO_LARGE);

  const key = `${input.resource}/${randomUUID()}.webp`;
  if (!isValidImageStorageKey(key))
    throw new InternalServerErrorException(IMAGE_STORAGE_FAILURE);
  return {
    buffer,
    contentLength: buffer.length,
    contentType: 'image/webp',
    key,
  };
}

function containsActivePayload(buffer: Buffer, format: string): boolean {
  // Canonicalization removes benign metadata. Reject unmistakable executable
  // markup outside PNG C2PA manifests, which can legitimately embed an SVG
  // identity icon. Those caBX chunks are stripped by the WebP re-encode.
  const activeMarkup = /<(?:script|html|svg)\b|<\?php/i;
  let scanFrom = 0;
  if (format === 'png') {
    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > buffer.length) break;
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'caBX') {
        if (activeMarkup.test(buffer.toString('latin1', scanFrom, offset)))
          return true;
        scanFrom = end;
      }
      offset = end;
      // Keep scanning anything appended after the PNG image, including fake
      // caBX chunks there: trailing markup is not image metadata.
      if (type === 'IEND') break;
    }
  }
  return activeMarkup.test(buffer.toString('latin1', scanFrom));
}
