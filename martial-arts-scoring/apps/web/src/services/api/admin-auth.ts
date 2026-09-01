import { apiClient, request } from '@/services/api/client';

export interface AdminIdentity {
  readonly id: string;
  readonly username: string;
}

export interface AdminSessionResponse {
  readonly admin: AdminIdentity;
}

export interface AdminLoginRequest {
  readonly username: string;
  readonly password: string;
}

export const adminAuthApi = {
  login: (credentials: AdminLoginRequest) =>
    apiClient.post<AdminSessionResponse>('admin/auth/login', credentials),
  logout: () => request<undefined>('admin/auth/logout', { method: 'POST' }),
  me: () => apiClient.get<AdminSessionResponse>('admin/auth/me'),
};
