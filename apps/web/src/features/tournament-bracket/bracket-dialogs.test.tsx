import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchDisplayState } from '@martial-arts-scoring/shared-types';
import { ApiClientError } from '@/services/api/client';
import { CancelBracketDialog } from './cancel-bracket-dialog';
import type { BracketFixture } from './fixture-presentation';
import { IntermissionDurationForm } from './intermission-duration-form';
import { WinnerDecisionDialog } from './winner-decision-dialog';

const api = vi.hoisted(() => ({
  cancelBracket: vi.fn(),
  decideBracketFixtureWinner: vi.fn(),
  updateWeightClass: vi.fn(),
}));

vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function entrant(id: string, name: string) {
  return {
    id,
    snapshotName: name,
    snapshotOrganization: null,
    snapshotImagePath: null,
    isSeed: false,
  };
}

const readyFixture = {
  id: 'fixture-1',
  displayReference: 'TK-01',
  roundNumber: 1,
  position: 1,
  status: 'READY',
  displayState: MatchDisplayState.READY,
  match: null,
  winnerEntrant: null,
  slots: [
    {
      side: 'RED',
      sourceFixtureId: null,
      resolvedEntrant: entrant('a', 'An'),
      directEntrant: null,
    },
    {
      side: 'BLUE',
      sourceFixtureId: null,
      resolvedEntrant: entrant('b', 'Bình'),
      directEntrant: null,
    },
  ],
} as BracketFixture;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WinnerDecisionDialog', () => {
  function renderDialog(onClose = vi.fn()) {
    renderWithClient(
      <WinnerDecisionDialog
        bracketId="bracket-1"
        fixture={readyFixture}
        initialWinnerId={null}
        onClose={onClose}
        tournamentId="t-1"
        weightClassId="w-1"
      />,
    );
    return onClose;
  }

  it('requires a winner and a reason before submitting', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận người thắng' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Chọn vận động viên chiến thắng.');

    fireEvent.click(screen.getByLabelText('Bình'));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận người thắng' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nhập lý do quyết định.');
    expect(api.decideBracketFixtureWinner).not.toHaveBeenCalled();
  });

  it('submits a withdrawal decision with a trimmed reason and closes', async () => {
    api.decideBracketFixtureWinner.mockResolvedValue({});
    const onClose = renderDialog();
    fireEvent.click(screen.getByLabelText('An'));
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: '  Chấn thương  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận người thắng' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(api.decideBracketFixtureWinner).toHaveBeenCalledWith('t-1', 'bracket-1', 'fixture-1', {
      entrantId: 'a',
      decisionType: 'WITHDRAWAL_OR_INJURY',
      reason: 'Chấn thương',
      idempotencyKey: expect.any(String) as string,
    });
  });
});

describe('CancelBracketDialog', () => {
  it('offers a forced cancellation when matches already started', async () => {
    api.cancelBracket
      .mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'BRACKET_CANCELLATION_UNSAFE',
          unsafeMatches: [{ id: 'm-1', publicId: 'A72K9P' }, { bogus: true }],
        }),
      )
      .mockResolvedValueOnce({});
    const onCancelled = vi.fn();
    renderWithClient(
      <CancelBracketDialog
        onCancelled={onCancelled}
        onClose={vi.fn()}
        tournamentId="t-1"
        weightClassId="w-1"
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Xác nhận hủy' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do hủy'), { target: { value: 'Sai danh sách' } });
    fireEvent.click(confirm);

    expect(await screen.findByRole('alert')).toHaveTextContent('A72K9P');
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn xác nhận hủy trận' }));

    await waitFor(() => {
      expect(onCancelled).toHaveBeenCalled();
    });
    expect(api.cancelBracket).toHaveBeenNthCalledWith(1, 't-1', 'w-1', 'Sai danh sách', false);
    expect(api.cancelBracket).toHaveBeenNthCalledWith(2, 't-1', 'w-1', 'Sai danh sách', true);
  });
});

describe('IntermissionDurationForm', () => {
  it('rejects invalid durations and saves valid ones', async () => {
    api.updateWeightClass.mockResolvedValue({});
    renderWithClient(
      <IntermissionDurationForm
        initialSeconds={30}
        isReadOnly={false}
        tournamentId="t-1"
        weightClassId="w-1"
      />,
    );
    const input = screen.getByLabelText('Thời gian nghỉ giữa hiệp (giây)');
    expect(input).toHaveValue(30);

    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nhập số nguyên không âm');

    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => {
      expect(api.updateWeightClass).toHaveBeenCalledWith('t-1', 'w-1', {
        intermissionDurationSeconds: 60,
      });
    });
  });

  it('is disabled in read-only mode', () => {
    renderWithClient(
      <IntermissionDurationForm
        initialSeconds={0}
        isReadOnly
        tournamentId="t-1"
        weightClassId="w-1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });
});
