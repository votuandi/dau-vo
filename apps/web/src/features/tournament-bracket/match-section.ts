export const MATCH_SECTIONS = ['bracket', 'schedule', 'standalone', 'settings'] as const;
export type MatchSection = (typeof MATCH_SECTIONS)[number];

/** Reads the `view` search param; unknown or missing values fall back to the bracket chart. */
export function parseMatchSection(value: string | null): MatchSection {
  return MATCH_SECTIONS.find((section) => section === value) ?? 'bracket';
}
