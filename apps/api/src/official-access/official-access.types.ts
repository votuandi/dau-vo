import type { TournamentOfficialRole } from '@prisma/client';
import type { Request } from 'express';

export interface OfficialSessionIdentity {
  sessionId: string;
  expiresAt: string;
  deviceId: string;
  official: { id: string; name: string; role: TournamentOfficialRole };
  tournament: { id: string; publicCode: string; name: string };
  activeAssignment: {
    id: string;
    role: TournamentOfficialRole;
    refereePosition: number | null;
    match: { id: string; publicId: string; status: string };
  } | null;
  status: 'READY' | 'IN_MATCH';
}
export interface ValidatedOfficialSession extends OfficialSessionIdentity {
  officialId: string;
  tournamentId: string;
}
export interface AuthenticatedOfficialRequest extends Request {
  officialSession: ValidatedOfficialSession;
}
