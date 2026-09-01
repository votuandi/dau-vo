import type { Request } from 'express';

export interface AdminIdentity {
  id: string;
  username: string;
}

export interface AdminAuthResponse {
  admin: AdminIdentity;
}

export interface CreatedAdminSession extends AdminAuthResponse {
  sessionToken: string;
}

export interface AuthenticatedAdminRequest extends Request {
  admin: AdminIdentity;
}
