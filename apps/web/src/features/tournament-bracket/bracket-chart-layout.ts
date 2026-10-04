export const BRACKET_LAYOUT = {
  fixtureWidth: 240,
  roundGap: 24,
  rowPitch: 104,
  fixtureGap: 12,
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

/** Layout coordinates stay stable under CSS zoom, scrolling and ancestor transforms. */
export function bracketElementBounds(element: HTMLElement, chart: HTMLElement) {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = element;
  while (current && current !== chart) {
    left += current.offsetLeft;
    top += current.offsetTop;
    const parent: Element | null = current.offsetParent;
    if (parent instanceof HTMLElement && parent !== chart) {
      left += parent.clientLeft;
      top += parent.clientTop;
    }
    current = parent instanceof HTMLElement ? parent : null;
  }
  return { left, top, right: left + element.offsetWidth, centerY: top + element.offsetHeight / 2 };
}

export function connectorPointInSvg(
  x: number,
  y: number,
  inverseScreenMatrix: Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>,
): { x: number; y: number } {
  const { a, b, c, d, e, f } = inverseScreenMatrix;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function bracketConnectorPath({
  sourceRight,
  sourceCenterY,
  targetLeft,
  targetCenterY,
  targetSide,
}: ConnectorBounds): string {
  const middleX = sourceRight + (targetLeft - sourceRight) * (targetSide === 'RED' ? 0.38 : 0.62);
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
