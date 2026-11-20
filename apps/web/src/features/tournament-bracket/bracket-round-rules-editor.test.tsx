import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MatchDisplayState,
  ScoringMethod,
  ScoringThreshold,
} from '@martial-arts-scoring/shared-types';
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
        scoringMethod: ScoringMethod.REFEREE_COMMAND,
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
    fireEvent.change(screen.getByLabelText('Bán kết: số hiệp'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Bán kết: thời lượng mỗi hiệp (giây)'), {
      target: { value: '120' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    expect(save).toHaveBeenCalledWith(
      1,
      {
        regulationRoundCount: 2,
        roundDurationMs: 120000,
        scoringMethod: ScoringMethod.JUDGE_FREE_WINDOW,
        supervisorScoringEnabled: false,
      },
      undefined,
    );
    expect(screen.getByLabelText('Chung kết: thời lượng mỗi hiệp (giây)')).toHaveValue(180);
  });

  it('offers both scoring methods per round, defaulting to the free 1.5 s window', () => {
    render(
      <BracketRoundRulesEditor
        data={bracket()}
        disabled={false}
        pending={false}
        onSave={vi.fn()}
      />,
    );
    const semi = screen.getByLabelText('Bán kết: hình thức cho điểm');
    expect(semi).toHaveValue(ScoringMethod.JUDGE_FREE_WINDOW);
    expect(screen.getByLabelText('Chung kết: hình thức cho điểm')).toHaveValue(
      ScoringMethod.REFEREE_COMMAND,
    );
    expect(
      within(semi)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Giám định chấm điểm tự do trong 1.5 giây',
      'Giám định chấm điểm theo hiệu lệnh trọng tài',
    ]);
  });

  it('saves the selected scoring method with the round settings', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.change(screen.getByLabelText('Bán kết: hình thức cho điểm'), {
      target: { value: ScoringMethod.REFEREE_COMMAND },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    expect(save).toHaveBeenCalledWith(
      1,
      {
        regulationRoundCount: 1,
        roundDurationMs: 90000,
        scoringMethod: ScoringMethod.REFEREE_COMMAND,
        supervisorScoringEnabled: false,
      },
      undefined,
    );
  });

  function supervisorSwitch(roundLabel: string): HTMLElement {
    return within(screen.getByRole('form', { name: `Cấu hình ${roundLabel}` })).getByRole(
      'switch',
      { name: 'Ghi nhận điểm từ trọng tài/giám sát' },
    );
  }

  it('offers supervisor scoring off by default and only for referee-command rounds', () => {
    render(
      <BracketRoundRulesEditor
        data={bracket()}
        disabled={false}
        pending={false}
        onSave={vi.fn()}
      />,
    );
    // Free 1.5 s window: off and disabled.
    expect(supervisorSwitch('Bán kết')).toHaveAttribute('aria-checked', 'false');
    expect(supervisorSwitch('Bán kết')).toBeDisabled();
    // Referee-command round: off but available.
    expect(supervisorSwitch('Chung kết')).toHaveAttribute('aria-checked', 'false');
    expect(supervisorSwitch('Chung kết')).toBeEnabled();
  });

  it('saves supervisor scoring when it is switched on', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.click(supervisorSwitch('Chung kết'));
    expect(supervisorSwitch('Chung kết')).toHaveAttribute('aria-checked', 'true');
    // 3 judges + TT = 4 scorers, so the scoring condition must be chosen too.
    fireEvent.change(screen.getByLabelText('Chung kết: điều kiện tính điểm'), {
      target: { value: ScoringThreshold.AT_LEAST_HALF },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Chung kết' }));
    expect(save).toHaveBeenCalledWith(
      2,
      {
        regulationRoundCount: 3,
        roundDurationMs: 180000,
        scoringMethod: ScoringMethod.REFEREE_COMMAND,
        supervisorScoringEnabled: true,
        scoringThreshold: ScoringThreshold.AT_LEAST_HALF,
      },
      undefined,
    );
  });

  it('turns supervisor scoring off when the round leaves referee-command scoring', () => {
    const save = vi.fn();
    const data = bracket();
    const staffing = data.staffing?.map((row) =>
      row.roundNumber === 2 ? { ...row, supervisorScoringEnabled: true } : row,
    );
    render(
      <BracketRoundRulesEditor
        data={{ ...data, ...(staffing ? { staffing } : {}) }}
        disabled={false}
        pending={false}
        onSave={save}
      />,
    );
    expect(supervisorSwitch('Chung kết')).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Chung kết: hình thức cho điểm'), {
      target: { value: ScoringMethod.JUDGE_FREE_WINDOW },
    });
    expect(supervisorSwitch('Chung kết')).toHaveAttribute('aria-checked', 'false');
    expect(supervisorSwitch('Chung kết')).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Chung kết' }));
    expect(save).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        scoringMethod: ScoringMethod.JUDGE_FREE_WINDOW,
        supervisorScoringEnabled: false,
      }),
      undefined,
    );
  });

  it('ignores an unknown scoring method value', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    const select = screen.getByLabelText('Chung kết: hình thức cho điểm');
    fireEvent.change(select, { target: { value: 'UNKNOWN' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Chung kết' }));
    expect(save).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ scoringMethod: ScoringMethod.REFEREE_COMMAND }),
      undefined,
    );
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
    expect(screen.getByLabelText('Bán kết: hình thức cho điểm')).toBeDisabled();
    expect(screen.getByLabelText('Bán kết: số giám định')).toBeDisabled();
    expect(screen.getByLabelText('Chung kết: số hiệp')).toBeEnabled();
    expect(screen.getByLabelText('Chung kết: hình thức cho điểm')).toBeEnabled();
    expect(supervisorSwitch('Chung kết')).toBeEnabled();
  });

  it('edits the judge count of a round and sends it only when it changed', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor
        data={{ ...bracket(), activeRefereeCount: 5 }}
        disabled={false}
        pending={false}
        onSave={save}
      />,
    );
    expect(
      screen.getByText(/Hiện có 5 giám định hoạt động; mỗi trận cần ít nhất 1 giám định/),
    ).toBeVisible();
    const judges = screen.getByLabelText('Bán kết: số giám định');
    expect(judges).toHaveValue(3);
    expect(judges).toHaveAttribute('max', '5');

    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    expect(save).toHaveBeenLastCalledWith(1, expect.any(Object), undefined);

    fireEvent.change(judges, { target: { value: '5' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    expect(save).toHaveBeenLastCalledWith(1, expect.any(Object), 5);
  });

  it.each(['0', '1.5', ''])('rejects invalid judge count %s', (value) => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.change(screen.getByLabelText('Bán kết: số giám định'), {
      target: { value },
    });
    const form = screen.getByRole('form', { name: 'Cấu hình Bán kết' });
    expect(within(form).getByRole('button')).toBeDisabled();
    fireEvent.submit(form);
    expect(save).not.toHaveBeenCalled();
  });

  function thresholdField(roundLabel: string): HTMLElement | null {
    return screen.queryByLabelText(`${roundLabel}: điều kiện tính điểm`);
  }

  it('shows the scoring condition only when the number of scorers is even', () => {
    render(
      <BracketRoundRulesEditor
        data={bracket()}
        disabled={false}
        pending={false}
        onSave={vi.fn()}
      />,
    );
    // 3 judges, free 1.5 s window → 3 scorers (odd): hidden.
    expect(thresholdField('Bán kết')).not.toBeInTheDocument();
    // 2 judges, free 1.5 s window (TT always off) → even: shown with its explanation.
    fireEvent.change(screen.getByLabelText('Bán kết: số giám định'), {
      target: { value: '2' },
    });
    const semi = within(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    // No default: the organiser must choose.
    expect(thresholdField('Bán kết')).toHaveValue('');
    expect(
      semi.getByText(
        'Do số người chấm điểm là số chẵn nên cần xác định chính xác điều kiện cho điểm.',
      ),
    ).toBeVisible();
    expect(
      semi.getByText('Lưu ý: Số người chấm điểm là tổng số Giám định và Trọng tài nếu có.'),
    ).toBeVisible();
    expect(
      within(screen.getByLabelText('Bán kết: điều kiện tính điểm'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Chọn điều kiện tính điểm',
      'Cho điểm VĐV có nhiều bình chọn hơn và số bình chọn phải lớn hơn một nửa tổng lựa chọn',
      'Cho điểm VĐV có nhiều bình chọn hơn và số bình chọn phải lớn hơn hoặc bằng một nửa tổng lựa chọn',
    ]);

    // Referee command, 3 judges: odd without TT, even (3 + TT) with it.
    expect(thresholdField('Chung kết')).not.toBeInTheDocument();
    fireEvent.click(supervisorSwitch('Chung kết'));
    expect(thresholdField('Chung kết')).toBeInTheDocument();
    // Referee command, 2 judges, TT off → even.
    fireEvent.click(supervisorSwitch('Chung kết'));
    fireEvent.change(screen.getByLabelText('Chung kết: số giám định'), {
      target: { value: '2' },
    });
    expect(thresholdField('Chung kết')).toBeInTheDocument();
    // 2 judges + TT → 3 scorers (odd): hidden again.
    fireEvent.click(supervisorSwitch('Chung kết'));
    expect(thresholdField('Chung kết')).not.toBeInTheDocument();
  });

  it('updates the helper text under the scoring condition as the settings change', () => {
    render(
      <BracketRoundRulesEditor
        data={bracket()}
        disabled={false}
        pending={false}
        onSave={vi.fn()}
      />,
    );
    // Referee command with 3 judges: turning TT on makes 4 scorers.
    fireEvent.click(supervisorSwitch('Chung kết'));
    const field = screen.getByLabelText('Chung kết: điều kiện tính điểm');
    expect(field).toHaveAccessibleDescription(
      'Có 4 người cho điểm: 3 giám định và 1 trọng tài. Hãy chọn điều kiện để xác định khi nào VĐV được cộng điểm.',
    );
    fireEvent.change(field, { target: { value: ScoringThreshold.MORE_THAN_HALF } });
    expect(field).toHaveAccessibleDescription(
      'Có 4 người cho điểm: 3 giám định và 1 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn 2',
    );
    fireEvent.change(field, { target: { value: ScoringThreshold.AT_LEAST_HALF } });
    expect(field).toHaveAccessibleDescription(
      'Có 4 người cho điểm: 3 giám định và 1 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn hoặc bằng 2',
    );
    // 6 judges, TT off.
    fireEvent.click(supervisorSwitch('Chung kết'));
    fireEvent.change(screen.getByLabelText('Chung kết: số giám định'), { target: { value: '6' } });
    expect(screen.getByLabelText('Chung kết: điều kiện tính điểm')).toHaveAccessibleDescription(
      'Có 6 người cho điểm: 6 giám định và 0 trọng tài thì VĐV được cộng điểm khi số lượt cho điểm lớn hơn hoặc bằng 3',
    );
  });

  it('blocks saving until a scoring condition is chosen, with a red field and an alert', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.change(screen.getByLabelText('Bán kết: số giám định'), { target: { value: '2' } });
    const form = screen.getByRole('form', { name: 'Cấu hình Bán kết' });
    const field = screen.getByLabelText('Bán kết: điều kiện tính điểm');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    expect(within(form).getByRole('button', { name: 'Lưu cấu hình' })).toBeEnabled();

    fireEvent.click(within(form).getByRole('button', { name: 'Lưu cấu hình' }));
    expect(save).not.toHaveBeenCalled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveClass('aria-[invalid=true]:border-destructive');
    expect(field).toHaveFocus();
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Vui lòng chọn Điều kiện tính điểm trước khi lưu cấu hình.',
    );

    // Choosing clears the error and saving goes through with the choice.
    fireEvent.change(field, { target: { value: ScoringThreshold.MORE_THAN_HALF } });
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu cấu hình' }));
    expect(save).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ scoringThreshold: ScoringThreshold.MORE_THAN_HALF }),
      2,
    );
  });

  it('neither requires nor sends a scoring condition for an odd number of scorers', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).not.toHaveProperty('scoringThreshold');
  });

  it('saves the chosen scoring condition with the round settings', () => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.change(screen.getByLabelText('Bán kết: số giám định'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Bán kết: điều kiện tính điểm'), {
      target: { value: ScoringThreshold.AT_LEAST_HALF },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Cấu hình Bán kết' }));
    expect(save).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({
        scoringThreshold: ScoringThreshold.AT_LEAST_HALF,
      }),
      2,
    );
  });

  it('loads a saved scoring condition', () => {
    const data = bracket();
    const staffing = data.staffing?.map((row) =>
      row.roundNumber === 1
        ? {
            ...row,
            requiredJudgeCount: 2,
            scoringThreshold: ScoringThreshold.AT_LEAST_HALF,
          }
        : row,
    );
    render(
      <BracketRoundRulesEditor
        data={{ ...data, ...(staffing ? { staffing } : {}) }}
        disabled={false}
        pending={false}
        onSave={vi.fn()}
      />,
    );
    expect(thresholdField('Bán kết')).toHaveValue(ScoringThreshold.AT_LEAST_HALF);
  });

  it.each(['0', '21', '1.5', ''])('rejects invalid round count %s', (value) => {
    const save = vi.fn();
    render(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending={false} onSave={save} />,
    );
    fireEvent.change(screen.getByLabelText('Bán kết: số hiệp'), {
      target: { value },
    });
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
    expect(supervisorSwitch('Chung kết')).toBeDisabled();
    rerender(
      <BracketRoundRulesEditor data={bracket()} disabled={false} pending onSave={vi.fn()} />,
    );
    expect(screen.getByLabelText('Chung kết: thời lượng mỗi hiệp (giây)')).toBeDisabled();
  });
});
