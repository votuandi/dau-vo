import { apiClient, request } from '@/services/api/client';
import type { MatchRole, RefereeSlot } from '@/types/shared';

export interface MatchAccessSession {
  readonly sessionId: string;
  readonly matchPublicId: string;
  readonly role: MatchRole;
  readonly refereeSlot: RefereeSlot | null;
  readonly deviceId: string;
  readonly expiresAt: string;
}

export interface MatchAccessSessionResponse {
  readonly session: MatchAccessSession;
}

export interface MatchAccessLoginRequest {
  readonly matchId: string;
  readonly securityCode: string;
  readonly deviceId: string;
}

export interface MatchAccessTakeoverRequest extends MatchAccessLoginRequest {
  readonly takeoverToken: string;
}

export const matchAccessApi = {
  login: (input: MatchAccessLoginRequest) =>
    apiClient.post<MatchAccessSessionResponse>('match-access/login', input),
  takeover: (input: MatchAccessTakeoverRequest) =>
    apiClient.post<MatchAccessSessionResponse>('match-access/takeover', input),
  logout: () => request<undefined>('match-access/logout', { method: 'POST' }),
  session: () => apiClient.get<MatchAccessSessionResponse>('match-access/session'),
};
