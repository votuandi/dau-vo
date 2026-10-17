import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe('createUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when the context provides it', () => {
    expect(createUuid()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues outside secure contexts', () => {
    const realCrypto = globalThis.crypto;
    // Plain-HTTP pages on a LAN address expose getRandomValues but not randomUUID.
    vi.stubGlobal('crypto', {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    });
    const first = createUuid();
    expect(first).toMatch(UUID_V4);
    expect(createUuid()).not.toBe(first);
  });
});
