import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { SubscriptionsService } from './subscriptions.service';
class ActivateDto {
  @IsOptional() @IsInt() durationBundle?: number;
  @IsOptional() @IsInt() tournamentBundle?: number;
  @IsString() @MaxLength(255) idempotencyKey!: string;
}
@Controller('subscriptions')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService)
    private readonly service: SubscriptionsService,
  ) {}
  @Post('activate') activate(
    @Body() body: ActivateDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    return this.service.activate(req.user, body);
  }
  @Get('me') me(@Req() req: AuthenticatedUserRequest) {
    return this.service.me(req.user.id);
  }
  @Get('orders') orders(@Req() req: AuthenticatedUserRequest) {
    return this.service.orders(req.user.id);
  }
}
