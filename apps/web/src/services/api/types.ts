import type { AthleteColor, AuditActorType, AuditEventType, MatchStatus, MatchSummary, PenaltyType, TournamentStatus, TournamentSummary } from '@dau-vo/shared-types';
export interface AdminUser { id: string; username: string; }
export interface TournamentInput { name: string; description?: string | undefined; location?: string | undefined; startDate?: string | undefined; endDate?: string | undefined; status?: TournamentStatus | undefined; }
export interface TournamentDetail extends TournamentSummary { matches?: MatchSummary[]; }
export interface AthleteInput { name: string; organization: string; }
export interface MatchInput { roundDurationMs: number; breakDurationMs: number; red: AthleteInput; blue: AthleteInput; }
export interface MatchDetail extends MatchSummary { tournamentName?: string | undefined; roundDurationMs?: number | undefined; breakDurationMs?: number | undefined; startedAt?: string | null | undefined; finishedAt?: string | null | undefined; }
export interface PenaltyHistoryItem { id: string; athleteId: string; athleteColor: AthleteColor; roundNumber: number | null; type: PenaltyType; value: number; createdAt: string; }
export interface AuditHistoryItem { id: string; actorType: AuditActorType; eventType: AuditEventType; createdAt: string; metadata?: Record<string, unknown> | null | undefined; }
export interface MatchAccessLoginInput { matchPublicId: string; securityCode: string; deviceId: string; }
export interface MatchAccessTakeoverInput { takeoverTicket: string; deviceId: string; }
export interface RegeneratedAccessCode { role: import('@dau-vo/shared-types').MatchRole; code: string; }
export interface MatchPatchInput { status?: MatchStatus | undefined; roundDurationMs?: number | undefined; breakDurationMs?: number | undefined; red?: AthleteInput | undefined; blue?: AthleteInput | undefined; }
