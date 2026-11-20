/**
 * Shared colour tone for the live match screens (supervisor console, judge console and
 * scoreboard), so every screen in the arena switches together.
 *
 * - `arena`: the round is running (deep blue arena background).
 * - `attention`: the clock is stopped for an ordinary pause, intermission, appeal or VAR
 *   (amber, a "wait" signal).
 * - `scoring`: the clock is stopped because judges are scoring a referee-command stop.
 *   A horizontal blue → purple → red gradient (left to right). Purple, the mix of the two
 *   corner colours, sits in the middle, so it reads as "both corners are being judged" and
 *   never looks like the amber pause or the single-colour winner screens.
 */
export type MatchScreenTone = 'arena' | 'attention' | 'scoring';

export function matchScreenTone({
  scoring,
  attention,
}: {
  readonly scoring: boolean;
  readonly attention: boolean;
}): MatchScreenTone {
  if (scoring) return 'scoring';
  return attention ? 'attention' : 'arena';
}

/** Full-screen background. */
export const matchToneBackgroundClassName: Record<MatchScreenTone, string> = {
  arena: 'arena-background',
  attention: 'bg-gradient-to-br from-amber-950 via-yellow-800 to-amber-950',
  scoring: 'bg-gradient-to-r from-blue-900 via-purple-900 to-red-900',
};

/** Translucent top bar (console headers, scoreboard header). */
export const matchToneBarClassName: Record<MatchScreenTone, string> = {
  arena: 'border-white/15 bg-blue-950/35',
  attention: 'border-amber-200/40 bg-amber-950/45',
  scoring: 'border-white/25 bg-slate-950/40',
};

/** Translucent main panel (clock / match state). */
export const matchTonePanelClassName: Record<MatchScreenTone, string> = {
  arena: 'border-white/15 bg-white/10 shadow-blue-950/20',
  attention: 'border-amber-200/40 bg-amber-950/30 shadow-amber-950/30',
  scoring: 'border-white/25 bg-slate-950/35 shadow-slate-950/30',
};
