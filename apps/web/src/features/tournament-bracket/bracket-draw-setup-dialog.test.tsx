import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BracketDrawSetupDialog, shuffle } from './bracket-draw-setup-dialog';

type DrawStrategy = 'RANDOM' | 'MANUAL' | 'SEEDED';
type DrawSubmit = (ids: readonly string[], strategy: DrawStrategy) => void;

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
    { id: 'a', name: 'An', organizationName: 'A', imageUrl: null, isSeed: true },
    { id: 'b', name: 'Bình', organizationName: 'B', imageUrl: null, isSeed: true },
    { id: 'c', name: 'Chi', organizationName: 'C', imageUrl: null, isSeed: false },
  ],
} as const;

describe('BracketDrawSetupDialog', () => {
  it('shuffles without mutating, dropping, or duplicating elements', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['a'])).toEqual(['a']);

    const values = ['a', 'b', 'c', 'd'];
    const shuffled = shuffle(values);

    expect(shuffled).toHaveLength(values.length);
    expect(new Set(shuffled)).toEqual(new Set(values));
    expect(values).toEqual(['a', 'b', 'c', 'd']);
  });

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
    expect(submit).toHaveBeenCalledWith([], 'RANDOM');
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
    expect(submit).toHaveBeenCalledWith(['b'], 'MANUAL');
  });

  it('fills missing seeded byes from remaining eligible athletes only', async () => {
    const user = userEvent.setup();
    const submit = vi.fn<DrawSubmit>();
    const seededSetup = {
      ...setup,
      summary: { ...setup.summary, athleteCount: 5, byeCount: 3 },
      eligibleAthletes: [
        { ...setup.eligibleAthletes[0], isSeed: true },
        { ...setup.eligibleAthletes[1], isSeed: false },
        ...setup.eligibleAthletes.slice(2),
        { id: 'd', name: 'Dung', organizationName: 'D', imageUrl: null, isSeed: false },
        { id: 'e', name: 'Em', organizationName: 'E', imageUrl: null, isSeed: false },
      ],
    };
    render(
      <BracketDrawSetupDialog
        error={null}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onSubmit={submit}
        pending={false}
        selectedIds={[]}
        setup={seededSetup}
      />,
    );

    await user.click(screen.getByLabelText('Đặc cách hạt giống'));
    await user.click(screen.getByRole('button', { name: /Chọn ngẫu nhiên 2/u }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận và bốc thăm' }));

    expect(submit).toHaveBeenCalledWith(expect.arrayContaining(['a']), 'SEEDED');
    const firstSubmission = submit.mock.calls[0];
    if (!firstSubmission) throw new Error('Expected a draw submission');
    const [selectedIds] = firstSubmission;
    expect(selectedIds).toHaveLength(3);
    expect(new Set(selectedIds).size).toBe(3);
    expect(selectedIds.every((id) => ['a', 'b', 'c', 'd', 'e'].includes(id))).toBe(true);
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
