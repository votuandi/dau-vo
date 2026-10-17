import type { MatchAccessSession } from '@/services/api/match-access';
import { createUuid } from '@/lib/uuid';

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
  return createUuid();
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
