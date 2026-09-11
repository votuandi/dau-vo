import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AUTH_REQUIRED_ERROR } from './admin-auth.constants';
import { AuthService } from './admin-auth.service';
import type { AuthenticatedUserRequest } from './admin-auth.types';
import { readAuthSessionToken } from './admin-auth.utils';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionToken = readAuthSessionToken(request);

    if (sessionToken === undefined) {
      throw new UnauthorizedException(AUTH_REQUIRED_ERROR);
    }

    const user = await this.authService.resolveSession(sessionToken);

    if (user === null) {
      throw new UnauthorizedException(AUTH_REQUIRED_ERROR);
    }

    (request as AuthenticatedUserRequest).user = user;
    return true;
  }
}
