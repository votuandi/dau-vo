import { apiClient, request } from '@/services/api/client';

export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
  readonly fullName: string | null;
  readonly role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  readonly isActive: boolean;
}

export interface AuthResponse {
  readonly user: AuthenticatedUser;
}

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
}

export interface RegisterRequest extends LoginRequest { readonly fullName: string; readonly email: string; readonly phone: string; readonly organization?: string; }

export const authApi = {
  login: (credentials: LoginRequest) => apiClient.post<AuthResponse>('auth/login', credentials),
  logout: () => request<undefined>('auth/logout', { method: 'POST' }),
  me: () => apiClient.get<AuthResponse>('auth/me'),
  register: (input: RegisterRequest) => apiClient.post<AuthResponse>('auth/register', input),
};
