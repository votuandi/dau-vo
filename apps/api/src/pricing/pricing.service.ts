import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType, Prisma } from '@prisma/client';
import type { PricingDiscountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/admin-auth.types';
import { calculateQuote, type PricingSelection } from './pricing-calculator';

@Injectable()
export class PricingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async quote(selection: PricingSelection) {
    const plan = await this.prisma.pricingPlanVersion.findFirst({
      where: { active: true },
      include: { discountTiers: true },
    });
    if (!plan)
      throw new NotFoundException({ code: 'ACTIVE_PRICING_NOT_FOUND' });
    try {
      return calculateQuote(plan, selection);
    } catch (error) {
      throw new BadRequestException({
        code: error instanceof Error ? error.message : 'INVALID_QUOTE',
      });
    }
  }
  list() {
    return this.prisma.pricingPlanVersion.findMany({
      include: {
        discountTiers: { orderBy: [{ type: 'asc' }, { quantity: 'asc' }] },
        createdBy: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async create(
    input: {
      baseAmountVnd: number;
      baseDurationMonths: number;
      baseTournamentLimit: number;
      durationAddonUnitAmountVnd: number;
      tournamentAddonUnitAmountVnd: number;
      discountTiers: Array<{
        type: PricingDiscountType;
        quantity: number;
        discountBasisPoints: number;
      }>;
    },
    actor: AuthenticatedUser,
  ) {
    this.validate(input);
    return this.prisma.$transaction(
      async (transaction) => {
        const previous = await transaction.pricingPlanVersion.findFirst({
          where: { active: true },
          select: { id: true },
        });
        await transaction.pricingPlanVersion.updateMany({
          where: { active: true },
          data: { active: false },
        });
        const plan = await transaction.pricingPlanVersion.create({
          data: {
            ...input,
            active: true,
            activatedAt: new Date(),
            createdByUserId: actor.id,
            discountTiers: { create: input.discountTiers },
          },
          include: { discountTiers: true },
        });
        await transaction.auditLog.create({
          data: {
            adminUserId: actor.id,
            eventType: AuditEventType.PRICING_VERSION_CREATED,
            metadata: {
              oldVersionId: previous?.id ?? null,
              newVersionId: plan.id,
              actorId: actor.id,
            },
          },
        });
        return plan;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private validate(input: {
    baseAmountVnd: number;
    baseDurationMonths: number;
    baseTournamentLimit: number;
    durationAddonUnitAmountVnd: number;
    tournamentAddonUnitAmountVnd: number;
    discountTiers: Array<{ quantity: number; discountBasisPoints: number }>;
  }) {
    if (
      ![
        input.baseAmountVnd,
        input.baseDurationMonths,
        input.baseTournamentLimit,
        input.durationAddonUnitAmountVnd,
        input.tournamentAddonUnitAmountVnd,
      ].every(Number.isInteger) ||
      input.baseAmountVnd < 0 ||
      input.baseDurationMonths < 1 ||
      input.baseTournamentLimit < 1 ||
      input.durationAddonUnitAmountVnd < 0 ||
      input.tournamentAddonUnitAmountVnd < 0 ||
      input.discountTiers.some(
        (x) =>
          !Number.isInteger(x.quantity) ||
          x.quantity < 1 ||
          !Number.isInteger(x.discountBasisPoints) ||
          x.discountBasisPoints < 0 ||
          x.discountBasisPoints > 10_000,
      )
    )
      throw new BadRequestException({ code: 'INVALID_PRICING_CONFIGURATION' });
    const required = [
      'DURATION:6',
      'DURATION:12',
      'TOURNAMENT:3',
      'TOURNAMENT:5',
      'TOURNAMENT:10',
    ];
    const keys = input.discountTiers.map(
      (tier) => `${tier.type}:${tier.quantity}`,
    );
    if (
      new Set(keys).size !== keys.length ||
      required.some((key) => !keys.includes(key))
    ) {
      throw new BadRequestException({ code: 'INVALID_PRICING_TIERS' });
    }
  }
}
