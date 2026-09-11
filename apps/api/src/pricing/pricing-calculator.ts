export interface PricingPlan {
  id: string;
  baseAmountVnd: number;
  baseDurationMonths: number;
  baseTournamentLimit: number;
  durationAddonUnitAmountVnd: number;
  tournamentAddonUnitAmountVnd: number;
  discountTiers: readonly {
    type: 'DURATION' | 'TOURNAMENT';
    quantity: number;
    discountBasisPoints: number;
  }[];
}
export interface PricingSelection {
  durationBundle?: number;
  tournamentBundle?: number;
}

export function calculateQuote(plan: PricingPlan, selection: PricingSelection) {
  const duration = selection.durationBundle ?? 0;
  const tournaments = selection.tournamentBundle ?? 0;
  const tier = (type: 'DURATION' | 'TOURNAMENT', quantity: number) =>
    plan.discountTiers.find(
      (item) => item.type === type && item.quantity === quantity,
    );
  const calculateAddon = (
    type: 'DURATION' | 'TOURNAMENT',
    quantity: number,
    unit: number,
  ) => {
    if (!Number.isInteger(quantity) || quantity < 0)
      throw new Error('INVALID_BUNDLE_QUANTITY');
    if (quantity === 0) return { subtotalVnd: 0, discountVnd: 0 };
    const discount = tier(type, quantity);
    if (!discount) throw new Error('UNSUPPORTED_BUNDLE');
    const subtotalVnd = quantity * unit;
    const discountVnd = Math.trunc(
      (subtotalVnd * discount.discountBasisPoints) / 10_000,
    );
    return { subtotalVnd, discountVnd };
  };
  const durationAddon = calculateAddon(
    'DURATION',
    duration,
    plan.durationAddonUnitAmountVnd,
  );
  const tournamentAddon = calculateAddon(
    'TOURNAMENT',
    tournaments,
    plan.tournamentAddonUnitAmountVnd,
  );
  return {
    pricingVersionId: plan.id,
    baseAmountVnd: plan.baseAmountVnd,
    durationAddon,
    tournamentAddon,
    totalDurationMonths: plan.baseDurationMonths + duration,
    totalTournamentLimit: plan.baseTournamentLimit + tournaments,
    totalPayableVnd:
      plan.baseAmountVnd +
      durationAddon.subtotalVnd -
      durationAddon.discountVnd +
      tournamentAddon.subtotalVnd -
      tournamentAddon.discountVnd,
  };
}
