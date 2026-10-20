import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Patch,
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
  AccountProfile,
  AuthResponse,
  AuthenticatedUserRequest,
} from './admin-auth.types';
import { getClientAddress, readAuthSessionToken } from './admin-auth.utils';
// This class must remain a runtime import for Nest's emitted validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AdminLoginDto } from './dto/admin-login.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RegisterDto } from './dto/register.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateProfileDto } from './dto/update-profile.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ChangePasswordDto } from './dto/change-password.dto';

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

  @Post('register')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async register(
    @Body() input: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.register(
      input,
      getClientAddress(request),
    );
    response.cookie(
      AUTH_SESSION_COOKIE,
      session.sessionToken,
      this.cookieOptions,
    );
    return { user: session.user };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  me(@Req() request: AuthenticatedUserRequest): AuthResponse {
    return { user: request.user };
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  profile(@Req() request: AuthenticatedUserRequest): Promise<AccountProfile> {
    return this.authService.profile(request.user.id);
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  updateProfile(
    @Body() input: UpdateProfileDto,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<AccountProfile> {
    return this.authService.updateProfile(request.user.id, input);
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @Body() input: ChangePasswordDto,
    @Req() request: AuthenticatedUserRequest,
  ): Promise<void> {
    await this.authService.changePassword(
      request.user.id,
      input.currentPassword,
      input.newPassword,
    );
  }
}
