import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import type { EnvironmentVariables } from '../config/environment';
import { MATCH_SESSION_COOKIE } from './match-access.constants';
import { MatchAccessService } from './match-access.service';
import type {
  AuthenticatedMatchRequest,
  CreatedMatchSession,
  MatchSessionResponse,
} from './match-access.types';
import { getClientAddress, readMatchSessionToken } from './match-access.utils';
// These classes must remain runtime imports for Nest's emitted validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  MatchAccessLoginDto,
  MatchAccessTakeoverDto,
} from './dto/match-access-login.dto';
import { MatchSessionGuard } from './match-session.guard';

@Controller('match-access')
export class MatchAccessController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    @Inject(MatchAccessService)
    private readonly matchAccessService: MatchAccessService,
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      path: '/api',
      sameSite: 'strict',
      secure: config.getOrThrow('NODE_ENV', { infer: true }) === 'production',
    };
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() credentials: MatchAccessLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MatchSessionResponse> {
    const created = await this.matchAccessService.login(
      credentials.matchId,
      credentials.securityCode,
      credentials.deviceId,
      getClientAddress(request),
    );

    await this.revokePreviousBrowserSession(request, created.sessionToken);
    this.setSessionCookie(response, created);

    return { session: created.session };
  }

  @Post('takeover')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async takeover(
    @Body() credentials: MatchAccessTakeoverDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MatchSessionResponse> {
    const created = await this.matchAccessService.takeover(
      credentials.matchId,
      credentials.securityCode,
      credentials.deviceId,
      credentials.takeoverToken,
      getClientAddress(request),
    );

    await this.revokePreviousBrowserSession(request, created.sessionToken);
    this.setSessionCookie(response, created);

    return { session: created.session };
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const sessionToken = readMatchSessionToken(request);

    if (sessionToken !== undefined) {
      await this.matchAccessService.revokeSession(sessionToken);
    }

    response.clearCookie(MATCH_SESSION_COOKIE, this.cookieOptions);
  }

  @Get('session')
  @UseGuards(MatchSessionGuard)
  @Header('Cache-Control', 'no-store')
  session(@Req() request: AuthenticatedMatchRequest): MatchSessionResponse {
    const matchSession = request.matchSession;

    return {
      session: {
        deviceId: matchSession.deviceId,
        expiresAt: matchSession.expiresAt,
        matchPublicId: matchSession.matchPublicId,
        refereeSlot: matchSession.refereeSlot,
        role: matchSession.role,
        sessionId: matchSession.sessionId,
      },
    };
  }

  private setSessionCookie(
    response: Response,
    created: CreatedMatchSession,
  ): void {
    response.cookie(MATCH_SESSION_COOKIE, created.sessionToken, {
      ...this.cookieOptions,
      expires: new Date(created.session.expiresAt),
    });
  }

  private async revokePreviousBrowserSession(
    request: Request,
    newSessionToken: string,
  ): Promise<void> {
    const previousSessionToken = readMatchSessionToken(request);

    if (
      previousSessionToken !== undefined &&
      previousSessionToken !== newSessionToken
    ) {
      await this.matchAccessService.revokeSession(previousSessionToken);
    }
  }
}
