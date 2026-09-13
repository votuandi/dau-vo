import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OFFICIAL_SESSION_REQUIRED_ERROR } from './official-access.constants';
import { OfficialAccessService } from './official-access.service';
import type { AuthenticatedOfficialRequest } from './official-access.types';
import { readOfficialSessionToken } from './official-access.utils';

@Injectable()
export class OfficialSessionGuard implements CanActivate {
  constructor(
    @Inject(OfficialAccessService)
    private readonly access: OfficialAccessService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    http.getResponse<Response>().setHeader('Cache-Control', 'no-store');
    const token = readOfficialSessionToken(request);
    const identity = token && (await this.access.resolveSession(token));
    if (!identity)
      throw new UnauthorizedException(OFFICIAL_SESSION_REQUIRED_ERROR);
    (request as AuthenticatedOfficialRequest).officialSession = identity;
    return true;
  }
}
