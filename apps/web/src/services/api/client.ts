import { appEnv } from '@/config/env';

export interface ApiErrorBody {
  readonly code?: string;
  readonly message?: string;
  readonly [key: string]: unknown;
}

export interface ApiRequestOptions<TBody = unknown> extends Omit<RequestInit, 'body'> {
  readonly body?: TBody;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorBody(payload: unknown): ApiErrorBody {
  if (isRecord(payload)) {
    return payload;
  }

  return typeof payload === 'string' && payload.length > 0 ? { message: payload } : {};
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as unknown;
    } catch {
      return undefined;
    }
  }

  const text = await response.text();
  return text || undefined;
}

function serializeBody(body: unknown, headers: Headers): BodyInit {
  if (typeof body === 'string' || body instanceof Blob || body instanceof FormData) {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body;
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return JSON.stringify(body);
}

function resolveEndpoint(path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  return `${appEnv.apiBaseUrl}/${path.replace(/^\/+/, '')}`;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? `API request failed with status ${String(status)}.`);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
  }
}

export async function request<TResponse, TBody = never>(
  path: string,
  options: ApiRequestOptions<TBody> = {},
): Promise<TResponse> {
  const { body, headers: headerInit, ...requestInit } = options;
  const headers = new Headers(headerInit);
  const init: RequestInit = {
    ...requestInit,
    credentials: requestInit.credentials ?? 'include',
    headers,
  };

  if (body !== undefined) {
    init.body = serializeBody(body, headers);
  }

  const response = await fetch(resolveEndpoint(path), init);
  const payload = await readResponseBody(response);

  if (!response.ok) {
    throw new ApiClientError(response.status, toErrorBody(payload));
  }

  return payload as TResponse;
}

type RequestOptionsWithoutBody = Omit<ApiRequestOptions<never>, 'body' | 'method'>;

export const apiClient = {
  get: <TResponse>(path: string, options: RequestOptionsWithoutBody = {}) =>
    request<TResponse>(path, { ...options, method: 'GET' }),
  post: <TResponse>(path: string, body: unknown, options: RequestOptionsWithoutBody = {}) =>
    request<TResponse, unknown>(path, { ...options, body, method: 'POST' }),
  put: <TResponse>(path: string, body: unknown, options: RequestOptionsWithoutBody = {}) =>
    request<TResponse, unknown>(path, { ...options, body, method: 'PUT' }),
  patch: <TResponse>(path: string, body: unknown, options: RequestOptionsWithoutBody = {}) =>
    request<TResponse, unknown>(path, { ...options, body, method: 'PATCH' }),
  delete: <TResponse>(path: string, options: RequestOptionsWithoutBody = {}) =>
    request<TResponse>(path, { ...options, method: 'DELETE' }),
};
