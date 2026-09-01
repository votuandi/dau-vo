import type { MatchAccessSession } from '@/services/api/match-access';

const DEVICE_ID_STORAGE_KEY = 'martial-arts-scoring.match-access.device-id';
const LAST_MATCH_ID_STORAGE_KEY = 'martial-arts-scoring.match-access.last-match-public-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A device identifier remains useful for the current tab when storage is unavailable.
  }
}

function createDeviceId(): string {
  if (typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function getOrCreateDeviceId(): string {
  const storedDeviceId = readStorage(DEVICE_ID_STORAGE_KEY);
  if (storedDeviceId && UUID_PATTERN.test(storedDeviceId)) {
    return storedDeviceId;
  }

  const deviceId = createDeviceId();
  writeStorage(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

export function getLastMatchPublicId(): string {
  const storedMatchId = readStorage(LAST_MATCH_ID_STORAGE_KEY)?.trim().toUpperCase();
  return storedMatchId && /^[A-Z0-9]{1,32}$/u.test(storedMatchId) ? storedMatchId : '';
}

export function rememberMatchAccessSession(session: MatchAccessSession): void {
  writeStorage(DEVICE_ID_STORAGE_KEY, session.deviceId);
  writeStorage(LAST_MATCH_ID_STORAGE_KEY, session.matchPublicId);
}
