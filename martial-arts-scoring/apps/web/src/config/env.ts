function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

function normalizeApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/u, '');

  if (normalized.length === 0) {
    return '/';
  }

  if (normalized.startsWith('/')) {
    return normalized;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS API URLs are supported.');
    }
  } catch (error) {
    throw new Error('VITE_API_URL must be an absolute HTTP URL or a root-relative path.', {
      cause: error,
    });
  }

  return normalized;
}

function normalizeSocketUrl(value: string | undefined): string | undefined {
  const normalized = optionalValue(value)?.replace(/\/+$/u, '');
  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS Socket.IO URLs are supported.');
    }
  } catch (error) {
    throw new Error('VITE_SOCKET_URL must be an absolute HTTP URL.', { cause: error });
  }

  return normalized;
}

function normalizeSocketPath(value: string | undefined): string {
  const normalized = optionalValue(value) ?? '/api/socket.io';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export const appEnv = Object.freeze({
  apiBaseUrl: normalizeApiBaseUrl(optionalValue(import.meta.env.VITE_API_URL) ?? '/api'),
  socketPath: normalizeSocketPath(import.meta.env.VITE_SOCKET_PATH),
  socketUrl: normalizeSocketUrl(import.meta.env.VITE_SOCKET_URL),
});
