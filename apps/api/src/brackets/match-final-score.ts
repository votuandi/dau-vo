import type { AthleteColor } from '@prisma/client';

/** Published final score of a completed match, keyed by corner colour. */
export interface MatchFinalScore {
  readonly RED: number;
  readonly BLUE: number;
}

interface FinalScoreSource {
  readonly lifecycle: string;
  readonly outcome: {
    readonly sourceAppeal: {
      readonly status: string;
      readonly invalidatedAt: Date | null;
      readonly sourceRound: { readonly invalidatedAt: Date | null };
      readonly adjustments: readonly {
        readonly finalScore: number;
        readonly athlete: { readonly color: AthleteColor };
      }[];
    } | null;
  } | null;
}

/**
 * The official score is the source appeal's per-athlete final score (judge
 * points plus bonus minus penalty), the same figure the result publication
 * and the dashboard use. Manual decisions without a valid appeal have no
 * score, so `null` is returned and only the winner is shown.
 */
export function matchFinalScore(
  match: FinalScoreSource,
): MatchFinalScore | null {
  const appeal = match.outcome?.sourceAppeal;
  if (
    match.lifecycle !== 'COMPLETED' ||
    !appeal ||
    appeal.status !== 'COMPLETED' ||
    appeal.invalidatedAt !== null ||
    appeal.sourceRound.invalidatedAt !== null
  )
    return null;
  const red = appeal.adjustments.find((item) => item.athlete.color === 'RED');
  const blue = appeal.adjustments.find((item) => item.athlete.color === 'BLUE');
  if (!red || !blue) return null;
  return { RED: red.finalScore, BLUE: blue.finalScore };
}

/** Prisma select that provides exactly what `matchFinalScore` needs. */
export const matchFinalScoreSelect = {
  lifecycle: true,
  outcome: {
    select: {
      sourceAppeal: {
        select: {
          status: true,
          invalidatedAt: true,
          sourceRound: { select: { invalidatedAt: true } },
          adjustments: {
            select: { finalScore: true, athlete: { select: { color: true } } },
          },
        },
      },
    },
  },
} as const;
