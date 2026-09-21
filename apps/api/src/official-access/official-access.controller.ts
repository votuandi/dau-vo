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
import { OFFICIAL_SESSION_COOKIE } from './official-access.constants';
import { OFFICIAL_IN_MATCH_LOGOUT_FORBIDDEN } from './official-access.constants';
import { ConflictException } from '@nestjs/common';
import { OfficialAccessService } from './official-access.service';
// These must remain runtime imports for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AuthenticatedOfficialRequest,
  OfficialSessionIdentity,
} from './official-access.types';
import {
  getClientAddress,
  readOfficialSessionToken,
} from './official-access.utils';
// Nest reads design:paramtypes at runtime; type-only imports erase DTOs.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  OfficialAccessLoginDto,
  OfficialAccessTakeoverDto,
} from './dto/official-access-login.dto';
import { OfficialSessionGuard } from './official-session.guard';

@Controller('official-access')
export class OfficialAccessController {
  private readonly options: CookieOptions;
  constructor(
    @Inject(OfficialAccessService)
    private readonly access: OfficialAccessService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.options = {
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
    @Body() body: OfficialAccessLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ session: OfficialSessionIdentity }> {
    await this.requireBrowserSessionReleased(request);
    const created = await this.access.login(
      body.tournamentCode,
      body.privatePasscode,
      body.deviceId,
      body.expectedRole,
      getClientAddress(request),
    );
    await this.revokeBrowser(request, created.sessionToken);
    this.setCookie(response, created.sessionToken, created.session.expiresAt);
    return { session: created.session };
  }
  @Post('takeover')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async takeover(
    @Body() body: OfficialAccessTakeoverDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ session: OfficialSessionIdentity }> {
    await this.requireBrowserSessionReleased(request);
    const created = await this.access.takeover(
      body.tournamentCode,
      body.privatePasscode,
      body.deviceId,
      body.expectedRole,
      body.takeoverToken,
      getClientAddress(request),
    );
    await this.revokeBrowser(request, created.sessionToken);
    this.setCookie(response, created.sessionToken, created.session.expiresAt);
    return { session: created.session };
  }
  @Post('logout')
  @HttpCode(204)
  @UseGuards(OfficialSessionGuard)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: AuthenticatedOfficialRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (await this.access.requireActiveAssignment(request.officialSession))
      throw new ConflictException(OFFICIAL_IN_MATCH_LOGOUT_FORBIDDEN);
    const token = readOfficialSessionToken(request);
    if (token) await this.access.revokeSession(token);
    response.clearCookie(OFFICIAL_SESSION_COOKIE, this.options);
  }
  @Get('session')
  @UseGuards(OfficialSessionGuard)
  @Header('Cache-Control', 'no-store')
  session(@Req() request: AuthenticatedOfficialRequest): {
    session: OfficialSessionIdentity;
  } {
    return { session: request.officialSession };
  }
  private setCookie(response: Response, token: string, expiresAt: string) {
    response.cookie(OFFICIAL_SESSION_COOKIE, token, {
      ...this.options,
      expires: new Date(expiresAt),
    });
  }
  private async revokeBrowser(request: Request, newToken: string) {
    const old = readOfficialSessionToken(request);
    if (old && old !== newToken) await this.access.revokeSession(old);
  }
  private async requireBrowserSessionReleased(request: Request): Promise<void> {
    const token = readOfficialSessionToken(request);
    if (!token) return;
    const current = await this.access.resolveSession(token);
    if (current && (await this.access.requireActiveAssignment(current)))
      throw new ConflictException(OFFICIAL_IN_MATCH_LOGOUT_FORBIDDEN);
  }
}
