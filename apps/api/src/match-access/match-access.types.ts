import type { MatchRole, RefereeSlot } from '@prisma/client';
import type { Request } from 'express';

export interface MatchSessionIdentity {
  sessionId: string;
  matchPublicId: string;
  role: MatchRole;
  refereeSlot: RefereeSlot | null;
  deviceId: string;
  expiresAt: string;
}

export interface MatchSessionResponse {
  session: MatchSessionIdentity;
}

export interface CreatedMatchSession extends MatchSessionResponse {
  sessionToken: string;
}

export interface ValidatedMatchSession extends MatchSessionIdentity {
  accessCodeId: string;
  matchId: string;
}

export interface AuthenticatedMatchRequest extends Request {
  matchSession: ValidatedMatchSession;
}

export interface SessionAlreadyActiveError {
  canTakeOver: true;
  code: 'SESSION_ALREADY_ACTIVE';
  message: string;
  takeoverToken: string;
}
