import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchDisplayState } from '@martial-arts-scoring/shared-types';
import type { ActiveBracket } from '@/services/api/admin-management';
import { BracketRoundRulesEditor } from './bracket-round-rules-editor';

function bracket(): ActiveBracket {
  return {
    bracket: {
      id: 'bracket',
      status: 'ACTIVE',
      athleteCount: 4,
      bracketSize: 4,
      roundCount: 2,
      confirmedAt: '',
      championEntrant: null,
    },
    entrants: [],
    fixtures: [],
    staffing: [
      {
        id: 'semi',
        roundNumber: 1,
        roundLabel: 'Bán kết',
        requiredJudgeCount: 3,
        regulationRoundCount: 1,
        roundDurationMs: 90000,
      },
      {
        id: 'final',
        roundNumber: 2,
        roundLabel: 'Chung kết',
        requiredJudgeCount: 3,
        regulationRoundCount: 3,
        roundDurationMs: 180000,
      },
    ],
  };
}

describe('BracketRoundRulesEditor', () => {
  it('edits one round independently and converts seconds to milliseconds', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    expect(screen.getByLabelText('Bán kết: số hiệp')).toHaveValue(1);
    expect(screen.getByLabelText('Chung kết: số hiệp')).toHaveValue(3);
    fireEvent.change(screen.getByLabelText('Bán kết: số hiệp'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Bán kết: thời lượng mỗi hiệp (giây)'), {
      target: { value: '120' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    expect(save).toHaveBeenCalledWith(1, 2, 120000);
    expect(screen.getByLabelText('Chung kết: thời lượng mỗi hiệp (giây)')).toHaveValue(180);
  });

  it('locks a prepared round while leaving other rounds editable', () => {
    const data: ActiveBracket = {
      ...bracket(),
      fixtures: [
        {
          id: 'fixture',
          roundNumber: 1,
          position: 1,
          displayReference: 'BK-1',
          status: 'MATCH_PREPARED',
          displayState: MatchDisplayState.READY,
          match: null,
          winnerEntrant: null,
          slots: [],
        },
      ],
    };
    render(
      <BracketRoundRulesEditor data={data} disabled={false} pending={false} onSave={vi.fn()} />,
    );
    expect(screen.getByLabelText('Bán kết: số hiệp')).toBeDisabled();
    expect(screen.getByLabelText('Chung kết: số hiệp')).toBeEnabled();
  });

  it.each(['0', '21', '1.5', ''])('rejects invalid round count %s', (value) => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.change(screen.getByLabelText('Bán kết: số hiệp'), { target: { value } });
    const form = screen.getByRole('form', { name: 'Cấu hình Bán kết' });
    expect(within(form).getByRole('button')).toBeDisabled();
    fireEvent.submit(form);
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['0', '3601', '1.5', ''])('rejects invalid duration %s', (value) => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.change(screen.getByLabelText('Bán kết: thời lượng mỗi hiệp (giây)'), {
      target: { value },
    });
    const form = screen.getByRole('form', { name: 'Cấu hình Bán kết' });
    expect(within(form).getByRole('button')).toBeDisabled();
    fireEvent.submit(form);
    expect(save).not.toHaveBeenCalled();
  });

  it('honors read-only access and pending requests', () => {
    const { rerender } = render(
      <BracketRoundRulesEditor data={bracket()} disabled pending={false} onSave={vi.fn()} />,
    );
    expect(screen.getByLabelText('Chung kết: số hiệp')).toBeDisabled();
    rerender(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending onSave={vi.fn()} />,
    );
    expect(screen.getByLabelText('Chung kết: thời lượng mỗi hiệp (giây)')).toBeDisabled();
  });
});
