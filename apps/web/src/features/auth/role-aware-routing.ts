import type { AuthenticatedUser } from '@/services/api/auth';

type UserRole = AuthenticatedUser['role'];

const allowedPathPrefixes = [
  '/super-admin',
  '/admin',
  '/tournaments',
  '/matches',
  '/account',
  '/subscription',
] as const;

export function getRoleLandingPath(role: UserRole): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/super-admin';
    case 'ADMIN':
      return '/admin';
    case 'USER':
      return '/tournaments';
  }
}

function isAllowedApplicationPathname(pathname: string): boolean {
  return allowedPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Returns only safe, same-origin application paths. The original path is kept so
 * query strings and hashes survive the login round-trip exactly as requested.
 */
export function getSafeReturnPath(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) return null;

  const { from } = state;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null;
  if (
    from.includes('\\') ||
    Array.from(from).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return null;
  }

  try {
    const url = new URL(from, window.location.origin);
    const decodedPathname = decodeURIComponent(url.pathname);

    if (
      url.origin !== window.location.origin ||
      decodedPathname.startsWith('//') ||
      decodedPathname.includes('\\') ||
      !isAllowedApplicationPathname(decodedPathname) ||
      decodedPathname === '/admin/login'
    ) {
      return null;
    }

    return from;
  } catch {
    return null;
  }
}
