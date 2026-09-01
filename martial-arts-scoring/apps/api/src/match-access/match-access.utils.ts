import type { Request } from 'express';

import { MATCH_SESSION_COOKIE } from './match-access.constants';

export function readMatchSessionToken(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[MATCH_SESSION_COOKIE];

  return typeof token === 'string' ? token : undefined;
}

export function getClientAddress(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
