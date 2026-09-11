import type { Request } from 'express';

import type { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
}

export interface AuthResponse {
  user: AuthenticatedUser;
}

export interface CreatedSession extends AuthResponse {
  sessionToken: string;
}

export interface AuthenticatedUserRequest extends Request {
  user: AuthenticatedUser;
}
