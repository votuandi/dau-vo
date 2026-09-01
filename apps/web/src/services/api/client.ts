import type { ApiErrorBody } from '@dau-vo/shared-types';
import { useClientSessionStore } from '@/stores/client-session-store';
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
export class ApiClientError extends Error { readonly status: number; readonly body: ApiErrorBody; constructor(status: number, body: ApiErrorBody) { super(body.message || 'Request failed'); this.name = 'ApiClientError'; this.status = status; this.body = body; } }
type Options = Omit<RequestInit, 'body' | 'signal'> & {
  body?: unknown | undefined;
  signal?: AbortSignal | null | undefined;
  matchAuthenticated?: boolean | undefined;
};
function isError(value: unknown): value is ApiErrorBody { return Boolean(value && typeof value === 'object' && 'code' in value && typeof (value as { code?: unknown }).code === 'string'); }
export async function apiRequest<T>(path: string, options: Options = {}): Promise<T> {
  const { body, matchAuthenticated, ...requestInit } = options;
  const headers = new Headers(options.headers); headers.set('Accept', 'application/json'); if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (matchAuthenticated) { const token = useClientSessionStore.getState().matchSession?.sessionToken; if (token) headers.set('Authorization', `Bearer ${token}`); }
  const init: RequestInit = { ...requestInit, credentials: 'include', headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  let response: Response; try { response = await fetch(`${API_BASE_URL}${path}`, init); } catch { throw new ApiClientError(0, { code: 'INTERNAL_ERROR', message: 'Network request failed' }); }
  if (response.status === 204) return undefined as T;
  const raw: unknown = await response.json().catch(() => null); if (!response.ok) throw new ApiClientError(response.status, isError(raw) ? raw : { code: 'INTERNAL_ERROR', message: response.statusText || 'Request failed' }); return raw as T;
}
export function collectionItems<T>(value: T[] | { items: T[] }): T[] { return Array.isArray(value) ? value : value.items; }
