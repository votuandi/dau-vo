import { apiClient } from './client';
export interface Quote {
  readonly pricingVersionId: string;
  readonly baseAmountVnd: number;
  readonly totalPayableVnd: number;
  readonly totalDurationMonths: number;
  readonly totalTournamentLimit: number;
  readonly durationAddon: { readonly subtotalVnd: number; readonly discountVnd: number };
  readonly tournamentAddon: { readonly subtotalVnd: number; readonly discountVnd: number };
}
export interface Entitlement {
  readonly activeFrom: string;
  readonly activeUntil: string;
  readonly tournamentLimit: number;
  readonly usedTournamentQuota: number;
  readonly remainingTournamentQuota: number;
  readonly accessState: 'ACTIVE_ADMIN' | 'EXPIRED_READ_ONLY' | 'HIDDEN';
  readonly readOnlyUntil: string | null;
}
export const subscriptionsApi = {
  quote: (body: { durationBundle?: number | undefined; tournamentBundle?: number | undefined }) =>
    apiClient.post<Quote>('subscriptions/quote', body),
  activate: (body: {
    durationBundle?: number | undefined;
    tournamentBundle?: number | undefined;
    idempotencyKey: string;
  }) => apiClient.post('subscriptions/activate', body),
  // A `null` entitlement arrives as an empty body, which the client reads as
  // `undefined`; React Query rejects `undefined` data, so normalize it here.
  me: async () => (await apiClient.get<Entitlement | null>('subscriptions/me')) ?? null,
};
