import { describe, expect, it } from 'vitest';
import {
  matchScreenTone,
  matchToneBackgroundClassName,
  matchToneBarClassName,
  matchTonePanelClassName,
} from './match-screen-tone';

describe('matchScreenTone', () => {
  it.each([
    [{ scoring: false, attention: false }, 'arena'],
    [{ scoring: false, attention: true }, 'attention'],
    // A scoring stop is also a pause; its own tone wins so screens tell them apart.
    [{ scoring: true, attention: true }, 'scoring'],
    [{ scoring: true, attention: false }, 'scoring'],
  ] as const)('maps %o to %s', (input, tone) => {
    expect(matchScreenTone(input)).toBe(tone);
  });

  it('gives the scoring tone a blue-purple-red look distinct from pause and arena', () => {
    expect(matchToneBackgroundClassName.scoring).toBe(
      'bg-gradient-to-r from-blue-900 via-purple-900 to-red-900',
    );
    expect(matchToneBarClassName.scoring).toContain('bg-slate-950/40');
    expect(matchTonePanelClassName.scoring).toContain('bg-slate-950/35');
    for (const tone of ['arena', 'attention'] as const) {
      expect(matchToneBackgroundClassName[tone]).not.toBe(matchToneBackgroundClassName.scoring);
    }
  });
});
