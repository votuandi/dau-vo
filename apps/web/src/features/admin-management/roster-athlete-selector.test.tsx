import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { AthleteColor } from '@/types/shared';
import type { TournamentAthlete } from '@/services/api/admin-management';
import { RosterAthleteSelector } from './roster-athlete-selector';

const athletes: readonly TournamentAthlete[] = [
  {
    id: 'a1',
    tournamentId: 't1',
    name: 'Nguyễn An',
    birthYear: 2000,
    details: null,
    imagePath: null,
    imageUrl: null,
    isSeed: false,
    isActive: true,
    organizationId: null,
    weightClassId: 'w1',
    organization: null,
    weightClass: { id: 'w1', name: '55 kg', isActive: true },
  },
  {
    id: 'a2',
    tournamentId: 't1',
    name: 'Trần Bình',
    birthYear: 2001,
    details: null,
    imagePath: null,
    imageUrl: null,
    isSeed: false,
    isActive: true,
    organizationId: null,
    weightClassId: 'w1',
    organization: null,
    weightClass: { id: 'w1', name: '55 kg', isActive: true },
  },
];

const withOrganization: TournamentAthlete = {
  id: 'a3',
  tournamentId: 't1',
  name: 'Lê Cường',
  birthYear: 1999,
  details: null,
  imagePath: null,
  imageUrl: null,
  isSeed: false,
  isActive: true,
  weightClassId: 'w1',
  weightClass: { id: 'w1', name: '55 kg', isActive: true },
  organizationId: 'o1',
  organization: { id: 'o1', name: 'CLB Sơn Trà', isActive: true },
};

function renderSelector(props: Partial<ComponentProps<typeof RosterAthleteSelector>> = {}) {
  const onChange = vi.fn();
  const view = render(
    <RosterAthleteSelector
      athletes={[...athletes, withOrganization]}
      color={AthleteColor.RED}
      label="Góc Đỏ (RED)"
      onChange={onChange}
      selectedAthleteId={null}
      weightClassName="55 kg"
      {...props}
    />,
  );
  return { ...view, combobox: screen.getByRole('combobox', { name: 'Góc Đỏ (RED)' }), onChange };
}

describe('RosterAthleteSelector', () => {
  it('excludes the competitor selected in the opposite corner and emits only the athlete id', async () => {
    const user = userEvent.setup();
    const { combobox, onChange } = renderSelector({ excludedAthleteId: 'a2' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: /Nguyễn An/u })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Trần Bình/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Nguyễn An/u }));
    expect(onChange).toHaveBeenCalledWith('a1');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(
      screen.getByText('Vận động viên đã chọn ở góc còn lại được loại khỏi danh sách.'),
    ).toBeVisible();
  });

  it('filters the dropdown by name, organization or birth year as the user types', async () => {
    const user = userEvent.setup();
    const { combobox } = renderSelector();

    await user.type(combobox, 'sơn trà');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Lê Cường · 1999 · CLB Sơn Trà',
    ]);
    await user.clear(combobox);
    await user.type(combobox, '2001');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Trần Bình · 2001 · Không đơn vị',
    ]);
    await user.clear(combobox);
    await user.type(combobox, 'không tồn tại');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getAllByText('Không có kết quả phù hợp.').length).toBeGreaterThan(0);
  });

  it('supports keyboard selection with the arrow keys and Enter', async () => {
    const user = userEvent.setup();
    const { combobox, onChange } = renderSelector();

    combobox.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(combobox).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Trần Bình/u }).id,
    );
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('a2');
  });

  it('shows the selected athlete, restores it on Escape and can clear the selection', async () => {
    const user = userEvent.setup();
    const { combobox, onChange } = renderSelector({ selectedAthleteId: 'a1' });

    expect(combobox).toHaveValue('Nguyễn An · 2000 · Không đơn vị');
    await user.clear(combobox);
    await user.type(combobox, 'Trần');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveValue('Nguyễn An · 2000 · Không đơn vị');
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Bỏ chọn Nguyễn An' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('closes without changing the selection when focus leaves the field', async () => {
    const user = userEvent.setup();
    const { combobox, onChange } = renderSelector();

    await user.type(combobox, 'Trần');
    await user.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is disabled until a weight class is chosen and while athletes are loading', () => {
    const { combobox, unmount } = renderSelector({ weightClassName: undefined });
    expect(combobox).toBeDisabled();
    expect(screen.getByText('Chọn hạng cân trước.')).toBeVisible();
    unmount();

    const loading = renderSelector({ loading: true });
    expect(loading.combobox).toBeDisabled();
    expect(loading.combobox).toHaveAttribute('placeholder', 'Đang tải danh sách…');
  });
});
