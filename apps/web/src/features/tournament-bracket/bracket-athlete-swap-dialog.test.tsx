import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BracketPreview } from '@/services/api/admin-management';
import { BracketAthleteSwapDialog } from './bracket-athlete-swap-dialog';

const preview: BracketPreview = {
  previewToken: 'preview-token',
  expiresAt: '',
  summary: {
    athleteCount: 3,
    bracketSize: 4,
    byeCount: 1,
    roundCount: 2,
    totalFixtureCount: 2,
    firstRoundFixtureCount: 1,
  },
  initialEntrants: [
    {
      drawPosition: 1,
      athleteId: 'a',
      athlete: { id: 'a', name: 'An', organizationName: null, imageUrl: null },
      isBye: false,
    },
    {
      drawPosition: 2,
      athleteId: 'b',
      athlete: { id: 'b', name: 'Bình', organizationName: null, imageUrl: null },
      isBye: false,
    },
    {
      drawPosition: 3,
      athleteId: 'c',
      athlete: { id: 'c', name: 'Cường', organizationName: null, imageUrl: null },
      isBye: false,
    },
    { drawPosition: 4, athleteId: null, athlete: null, isBye: true },
  ],
  rounds: [],
};

describe('BracketAthleteSwapDialog', () => {
  it('offers every other preview athlete and submits the selected athlete', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BracketAthleteSwapDialog
        athleteId="a"
        error={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        preview={preview}
      />,
    );

    expect(screen.getByLabelText('Vận động viên thay thế')).toHaveTextContent('Bình');
    expect(screen.getByLabelText('Vận động viên thay thế')).toHaveTextContent('Cường');
    await user.click(screen.getByRole('radio', { name: /Cường/ }));
    await user.click(screen.getByRole('button', { name: 'Đổi vị trí' }));
    expect(onSubmit).toHaveBeenCalledWith('c');
  });
});
