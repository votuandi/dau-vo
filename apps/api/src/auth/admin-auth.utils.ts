import type { Request } from 'express';

import { AUTH_SESSION_COOKIE } from './admin-auth.constants';

export function readAuthSessionToken(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[AUTH_SESSION_COOKIE];

  return typeof token === 'string' ? token : undefined;
}

export function getClientAddress(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
