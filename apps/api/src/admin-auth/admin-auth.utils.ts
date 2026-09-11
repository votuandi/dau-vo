import type { Request } from 'express';

import { ADMIN_SESSION_COOKIE } from './admin-auth.constants';

export function readAdminSessionToken(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[ADMIN_SESSION_COOKIE];

  return typeof token === 'string' ? token : undefined;
}

export function getClientAddress(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
