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
import { ADMIN_SESSION_COOKIE } from './admin-auth.constants';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import type {
  AdminAuthResponse,
  AuthenticatedAdminRequest,
} from './admin-auth.types';
import { getClientAddress, readAdminSessionToken } from './admin-auth.utils';
// This class must remain a runtime import for Nest's emitted validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('admin/auth')
export class AdminAuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    @Inject(AdminAuthService)
    private readonly adminAuthService: AdminAuthService,
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      path: '/api/admin',
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
  ): Promise<AdminAuthResponse> {
    const session = await this.adminAuthService.login(
      credentials.username,
      credentials.password,
      getClientAddress(request),
    );
    const previousSessionToken = readAdminSessionToken(request);

    if (previousSessionToken !== undefined) {
      await this.adminAuthService.revokeSession(previousSessionToken);
    }

    response.cookie(
      ADMIN_SESSION_COOKIE,
      session.sessionToken,
      this.cookieOptions,
    );

    return { admin: session.admin };
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const sessionToken = readAdminSessionToken(request);

    if (sessionToken !== undefined) {
      await this.adminAuthService.revokeSession(sessionToken);
    }

    response.clearCookie(ADMIN_SESSION_COOKIE, this.cookieOptions);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  me(@Req() request: AuthenticatedAdminRequest): AdminAuthResponse {
    return { admin: request.admin };
  }
}
