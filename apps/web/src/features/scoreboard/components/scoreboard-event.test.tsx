import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ScoreboardWeightClass } from './scoreboard-event';

it('shows the bracket round below the weight class', () => {
  const { rerender } = render(
    <ScoreboardWeightClass weightClass={{ name: '60 kg' }} bracketRoundNumber={2} />,
  );
  expect(screen.getByText('60 kg')).toBeInTheDocument();
  expect(screen.getByText('Vòng 2')).toBeInTheDocument();
  rerender(<ScoreboardWeightClass weightClass={{ name: '60 kg' }} bracketRoundNumber={null} />);
  expect(screen.queryByText('Vòng 2')).not.toBeInTheDocument();
});
