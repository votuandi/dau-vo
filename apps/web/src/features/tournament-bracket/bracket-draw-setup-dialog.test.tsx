import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BracketDrawSetupDialog } from './bracket-draw-setup-dialog';

const setup = {
  setupToken: 'setup',
  expiresAt: '',
  summary: {
    athleteCount: 6,
    bracketSize: 8,
    byeCount: 2,
    roundCount: 3,
    totalFixtureCount: 7,
    firstRoundFixtureCount: 2,
  },
  eligibleAthletes: [
    { id: 'a', name: 'An', organizationName: 'A', imageUrl: null },
    { id: 'b', name: 'Bình', organizationName: 'B', imageUrl: null },
    { id: 'c', name: 'Chi', organizationName: 'C', imageUrl: null },
  ],
} as const;

describe('BracketDrawSetupDialog', () => {
  it.each([
    [29, 32, 13],
    [31, 32, 15],
  ])(
    'uses the server-provided first-round fixture count for %i athletes',
    (athleteCount, bracketSize, expected) => {
      render(
        <BracketDrawSetupDialog
          error={null}
          onClose={vi.fn()}
          onReload={vi.fn()}
          onSubmit={vi.fn()}
          pending={false}
          selectedIds={[]}
          setup={{
            ...setup,
            summary: {
              ...setup.summary,
              athleteCount,
              bracketSize,
              byeCount: bracketSize - athleteCount,
              firstRoundFixtureCount: expected,
            },
          }}
        />,
      );
      expect(screen.getByText('Trận vòng 1').parentElement).toHaveTextContent(String(expected));
    },
  );

  it('only submits after confirmation and supports random byes', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <BracketDrawSetupDialog
        error={null}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSubmit={submit}
        pending={false}
        selectedIds={[]}
        setup={setup}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('3 vòng');
    await user.click(screen.getByRole('button', { name: 'Xác nhận và bốc thăm' }));
    expect(submit).toHaveBeenCalledWith([]);
  });

  it('enforces the authoritative maximum and permits deselection', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <BracketDrawSetupDialog
        error={null}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSubmit={submit}
        pending={false}
        selectedIds={[]}
        setup={setup}
      />,
    );
    await user.click(screen.getByLabelText('Chỉ định vận động viên'));
    await user.click(screen.getByLabelText('Chọn An'));
    await user.click(screen.getByLabelText('Chọn Bình'));
    expect(screen.getByLabelText('Chọn Chi')).toBeDisabled();
    await user.click(screen.getByLabelText('Chọn An'));
    expect(screen.getByLabelText('Chọn Chi')).not.toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận và bốc thăm' }));
    expect(submit).toHaveBeenCalledWith(['b']);
  });

  it('states that no bye is available and closes with Escape', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <BracketDrawSetupDialog
        error={null}
        onClose={close}
        onReload={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        selectedIds={[]}
        setup={{ ...setup, summary: { ...setup.summary, byeCount: 0, athleteCount: 8 } }}
      />,
    );
    expect(screen.getByText(/Không có vận động viên/u)).toBeVisible();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
