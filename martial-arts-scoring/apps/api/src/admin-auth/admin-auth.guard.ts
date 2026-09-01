import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { ADMIN_AUTH_REQUIRED_ERROR } from './admin-auth.constants';
import { AdminAuthService } from './admin-auth.service';
import type { AuthenticatedAdminRequest } from './admin-auth.types';
import { readAdminSessionToken } from './admin-auth.utils';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(AdminAuthService)
    private readonly adminAuthService: AdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionToken = readAdminSessionToken(request);

    if (sessionToken === undefined) {
      throw new UnauthorizedException(ADMIN_AUTH_REQUIRED_ERROR);
    }

    const admin = await this.adminAuthService.resolveSession(sessionToken);

    if (admin === null) {
      throw new UnauthorizedException(ADMIN_AUTH_REQUIRED_ERROR);
    }

    (request as AuthenticatedAdminRequest).admin = admin;
    return true;
  }
}
