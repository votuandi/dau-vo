import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { MATCH_SESSION_REQUIRED_ERROR } from './match-access.constants';
import { MatchAccessService } from './match-access.service';
import type { AuthenticatedMatchRequest } from './match-access.types';
import { readMatchSessionToken } from './match-access.utils';

@Injectable()
export class MatchSessionGuard implements CanActivate {
  constructor(
    @Inject(MatchAccessService)
    private readonly matchAccessService: MatchAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    const sessionToken = readMatchSessionToken(request);

    if (sessionToken === undefined) {
      throw new UnauthorizedException(MATCH_SESSION_REQUIRED_ERROR);
    }

    const matchSession =
      await this.matchAccessService.resolveSession(sessionToken);

    if (matchSession === null) {
      throw new UnauthorizedException(MATCH_SESSION_REQUIRED_ERROR);
    }

    (request as AuthenticatedMatchRequest).matchSession = matchSession;
    return true;
  }
}
