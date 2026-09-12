import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
    isActive: true,
    organizationId: null,
    weightClassId: 'w1',
    organization: null,
    weightClass: { id: 'w1', name: '55 kg', isActive: true },
  },
];

describe('RosterAthleteSelector', () => {
  it('excludes the competitor selected in the opposite corner and emits only the athlete id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RosterAthleteSelector
        athletes={athletes}
        color={AthleteColor.RED}
        excludedAthleteId="a2"
        label="Góc Đỏ (RED)"
        onChange={onChange}
        selectedAthleteId={null}
        weightClassName="55 kg"
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Góc Đỏ (RED)' });
    expect(screen.getByRole('option', { name: /Nguyễn An/u })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Trần Bình/u })).not.toBeInTheDocument();
    await user.selectOptions(select, 'a1');
    expect(onChange).toHaveBeenCalledWith('a1');
    expect(
      screen.getByText('Vận động viên đã chọn ở góc còn lại được loại khỏi danh sách.'),
    ).toBeVisible();
  });
});
