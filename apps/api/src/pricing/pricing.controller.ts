import { Body, Controller, Get, Inject, Post, Put, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../auth/admin-auth.guard'; import { Roles } from '../auth/roles.decorator'; import { RolesGuard } from '../auth/roles.guard'; import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { PricingService } from './pricing.service';
class QuoteDto { @IsOptional() @IsInt() durationBundle?: number; @IsOptional() @IsInt() tournamentBundle?: number; }
class TierDto { @IsIn(['DURATION', 'TOURNAMENT']) type!: 'DURATION' | 'TOURNAMENT'; @IsInt() @Min(1) quantity!: number; @IsInt() @Min(0) @Max(10000) discountBasisPoints!: number; }
class PricingDto { @IsInt() @Min(0) baseAmountVnd!: number; @IsInt() @Min(1) baseDurationMonths!: number; @IsInt() @Min(1) baseTournamentLimit!: number; @IsInt() @Min(0) durationAddonUnitAmountVnd!: number; @IsInt() @Min(0) tournamentAddonUnitAmountVnd!: number; @IsArray() @ValidateNested({ each: true }) @Type(() => TierDto) discountTiers!: TierDto[]; }
@Controller()
export class PricingController { constructor(@Inject(PricingService) private readonly pricing: PricingService) {} @Post('subscriptions/quote') @UseGuards(AuthGuard) quote(@Body() body: QuoteDto) { return this.pricing.quote(body); } @Get('super-admin/pricing') @UseGuards(AuthGuard, RolesGuard) @Roles(UserRole.SUPER_ADMIN) list() { return this.pricing.list(); } @Put('super-admin/pricing') @UseGuards(AuthGuard, RolesGuard) @Roles(UserRole.SUPER_ADMIN) create(@Body() body: PricingDto, @Req() request: AuthenticatedUserRequest) { return this.pricing.create(body, request.user); } }
