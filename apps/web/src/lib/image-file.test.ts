import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatKiB, IMAGE_MAX_BYTES, imageFileProblem } from './image-file';
import { useObjectUrl } from './use-object-url';

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'image', { type });
}

describe('imageFileProblem', () => {
  it('accepts supported images within the size limit', () => {
    expect(imageFileProblem(file('image/png', 10))).toBeNull();
    expect(imageFileProblem(file('image/webp', IMAGE_MAX_BYTES))).toBeNull();
  });

  it('rejects other types before checking size', () => {
    expect(imageFileProblem(file('image/gif', 10))).toBe('type');
    expect(imageFileProblem(file('image/gif', IMAGE_MAX_BYTES + 1))).toBe('type');
  });

  it('rejects oversized images', () => {
    expect(imageFileProblem(file('image/jpeg', IMAGE_MAX_BYTES + 1))).toBe('size');
  });

  it('formats sizes in KiB', () => {
    expect(formatKiB(1536)).toBe('1.5 KiB');
  });
});

describe('useObjectUrl', () => {
  const descriptors = {
    createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
    revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
  };
  afterEach(() => {
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(URL, name, descriptor);
      else Reflect.deleteProperty(URL, name);
    }
  });

  it('creates one URL per file and revokes it on change and unmount', () => {
    const create = vi.fn().mockReturnValueOnce('blob:1').mockReturnValueOnce('blob:2');
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const first = file('image/png', 1);
    const second = file('image/png', 2);

    const { result, rerender, unmount } = renderHook(({ value }) => useObjectUrl(value), {
      initialProps: { value: first },
    });
    expect(result.current).toBe('blob:1');
    rerender({ value: first });
    expect(create).toHaveBeenCalledTimes(1);

    rerender({ value: second });
    expect(revoke).toHaveBeenCalledWith('blob:1');
    expect(result.current).toBe('blob:2');

    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:2');
  });

  it('returns null without a file', () => {
    const { result } = renderHook(() => useObjectUrl(null));
    expect(result.current).toBeNull();
  });
});
