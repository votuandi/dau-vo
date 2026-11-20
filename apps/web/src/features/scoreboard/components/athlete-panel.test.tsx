import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AthleteColor } from '@martial-arts-scoring/shared-types';
import type { ScoreboardAthlete } from '../scoreboard-view-model';
import { AthletePanel } from './athlete-panel';

const red: ScoreboardAthlete = {
  color: AthleteColor.RED,
  name: 'Nguyễn An',
  organization: 'Sài Gòn',
  athleteImagePath: null,
  organizationImagePath: null,
  score: 3,
  violations: 0,
  faultCounts: { minor: 0, major: 0 },
};

describe('AthletePanel score highlight', () => {
  it('blinks the score while the athlete point is highlighted', () => {
    const { rerender } = render(<AthletePanel athlete={red} scoreHighlightKey="call-1" />);
    const score = screen.getByLabelText('Điểm Đỏ: 3');
    expect(score).toHaveClass('scoreboard-score-highlight');
    expect(score).toHaveAttribute('data-highlighted', 'true');

    // A new call for the same athlete remounts the score so the blink restarts.
    rerender(<AthletePanel athlete={{ ...red, score: 4 }} scoreHighlightKey="call-2" />);
    const next = screen.getByLabelText('Điểm Đỏ: 4');
    expect(next).not.toBe(score);
    expect(next).toHaveClass('scoreboard-score-highlight');
  });

  it('shows a plain score otherwise', () => {
    render(<AthletePanel athlete={red} />);
    const score = screen.getByLabelText('Điểm Đỏ: 3');
    expect(score).not.toHaveClass('scoreboard-score-highlight');
    expect(score).toHaveAttribute('data-highlighted', 'false');
  });
});
