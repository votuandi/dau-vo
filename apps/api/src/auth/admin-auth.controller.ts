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
import { AUTH_SESSION_COOKIE } from './admin-auth.constants';
import { AuthGuard } from './admin-auth.guard';
import { AuthService } from './admin-auth.service';
import type {
  AuthResponse,
  AuthenticatedUserRequest,
} from './admin-auth.types';
import { getClientAddress, readAuthSessionToken } from './admin-auth.utils';
// This class must remain a runtime import for Nest's emitted validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
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
    @Body() credentials: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.login(
      credentials.username,
      credentials.password,
      getClientAddress(request),
    );
    const previousSessionToken = readAuthSessionToken(request);

    if (previousSessionToken !== undefined) {
      await this.authService.revokeSession(previousSessionToken);
    }

    response.cookie(
      AUTH_SESSION_COOKIE,
      session.sessionToken,
      this.cookieOptions,
    );

    return { user: session.user };
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const sessionToken = readAuthSessionToken(request);

    if (sessionToken !== undefined) {
      await this.authService.revokeSession(sessionToken);
    }

    response.clearCookie(AUTH_SESSION_COOKIE, this.cookieOptions);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  me(@Req() request: AuthenticatedUserRequest): AuthResponse {
    return { user: request.user };
  }
}
