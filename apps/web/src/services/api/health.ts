import { apiClient } from '@/services/api/client';

export interface HealthResponse {
  readonly status: string;
  readonly timestamp?: string;
  readonly services?: Readonly<Record<string, unknown>>;
}

export function getApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiClient.get<HealthResponse>('health', signal ? { signal } : {});
}
