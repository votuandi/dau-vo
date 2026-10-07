/** Image types and size accepted by every media upload endpoint. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(IMAGE_ACCEPT.split(','));

export type ImageFileProblem = 'type' | 'size';

/** Why a chosen file cannot be uploaded as an image, or null when it can. */
export function imageFileProblem(file: File): ImageFileProblem | null {
  if (!IMAGE_TYPES.has(file.type)) return 'type';
  if (file.size > IMAGE_MAX_BYTES) return 'size';
  return null;
}

export function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
