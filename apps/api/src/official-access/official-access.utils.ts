import type { Request } from 'express';
import { OFFICIAL_SESSION_COOKIE } from './official-access.constants';

export function readOfficialSessionToken(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[OFFICIAL_SESSION_COOKIE];
  return typeof token === 'string' ? token : undefined;
}

export function getClientAddress(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
