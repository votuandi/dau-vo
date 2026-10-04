export const BRACKET_LAYOUT = {
  fixtureWidth: 240,
  roundGap: 32,
  rowPitch: 128,
  fixtureGap: 16,
} as const;

export function measuredFixtureRowPitch(
  fixtures: readonly { readonly roundNumber: number; readonly height: number }[],
): number {
  return Math.max(
    BRACKET_LAYOUT.rowPitch,
    ...fixtures.map(({ roundNumber, height }) =>
      Math.ceil((height + BRACKET_LAYOUT.fixtureGap) / 2 ** (roundNumber - 1)),
    ),
  );
}

interface ConnectorBounds {
  readonly sourceRight: number;
  readonly sourceCenterY: number;
  readonly targetLeft: number;
  readonly targetCenterY: number;
  readonly targetSide: 'RED' | 'BLUE';
}

export function bracketConnectorPath({
  sourceRight,
  sourceCenterY,
  targetLeft,
  targetCenterY,
  targetSide,
}: ConnectorBounds): string {
  const middleX =
    sourceRight + Math.max(28, targetLeft - sourceRight) * (targetSide === 'RED' ? 0.38 : 0.62);
  return `M ${String(sourceRight)} ${String(sourceCenterY)} H ${String(middleX)} V ${String(targetCenterY)} H ${String(targetLeft)}`;
}

export function fixtureTopOffsets(
  rounds: readonly {
    readonly roundNumber: number;
    readonly fixtures: readonly { readonly id: string; readonly position: number }[];
  }[],
  rowPitch: number = BRACKET_LAYOUT.rowPitch,
): ReadonlyMap<string, number> {
  const offsets = new Map<string, number>();
  for (const round of rounds) {
    const roundIndex = round.roundNumber - 1;
    round.fixtures.forEach((fixture) => {
      const logicalSlot = (fixture.position - 0.5) * 2 ** roundIndex - 0.5;
      offsets.set(fixture.id, logicalSlot * rowPitch);
    });
  }
  return offsets;
}
