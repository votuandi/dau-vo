import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  AthleteColor,
  MatchLifecycle,
  MatchStatus,
  type PublicMatchStatePayload,
} from '@martial-arts-scoring/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supervisorScoreboardApi } from '@/services/api/scoreboard';
import { ScoreboardPage } from './scoreboard-page';

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/toast', () => ({ toast: toastMock }));

const realtimeMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/scoreboard/scoreboard-realtime', () => ({
  useScoreboardRealtime: realtimeMock,
}));

const snapshot: PublicMatchStatePayload = {
  activeRound: {
    endedAt: null,
    endsAt: '2030-01-01T00:02:00.000Z',
    pausedAt: null,
    remainingDurationMs: null,
    roundNumber: 1,
    attemptNumber: 0,
    stage: 'REGULATION',
    startedAt: '2030-01-01T00:00:00.000Z',
  },
  intermissionEndsAt: null,
  athletes: [
    {
      color: AthleteColor.RED,
      name: 'Võ sĩ Đỏ',
      organization: 'CLB Đỏ',
      athleteImagePath: 'athletes/red.webp',
      organizationImagePath: 'organizations/red.webp',
      score: 4,
      violations: 1,
      faultCounts: { minor: 1, major: 0 },
    },
    {
      color: AthleteColor.BLUE,
      name: 'Võ sĩ Xanh',
      organization: 'CLB Xanh',
      athleteImagePath: 'athletes/blue.webp',
      organizationImagePath: 'organizations/blue.webp',
      score: 2,
      violations: 3,
      faultCounts: { minor: 2, major: 1 },
    },
  ],
  committedScores: { source: null, attemptNumber: null, RED: null, BLUE: null },
  generatedAt: '2030-01-01T00:00:00.000Z',
  judgeVotes: { judgeCount: 3, lastResolvedWindow: null },
  match: {
    currentRound: 1,
    finishedAt: null,
    intermissionEndsAt: null,
    lifecycle: MatchLifecycle.IN_PROGRESS,
    phase: MatchStatus.ROUND_1_RUNNING,
    publicId: 'A72K9P',
    rulesVersion: 'FAULT_APPEAL_OVERTIME_V2',
    status: MatchStatus.ROUND_1_RUNNING,
    outcome: null,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScoreboardPage', () => {
  it('shows public tournament identity and weight class', () => {
    realtimeMock.mockReturnValue({
      connectionStatus: 'connected',
      snapshot: {
        ...snapshot,
        tournament: {
          name: 'Giải Vô địch Võ thuật',
          location: 'Nhà thi đấu Quận 7',
          imagePath: 'events/logo.webp',
        },
        weightClass: { name: 'Nam 60–65 kg' },
      },
    });
    render(
      <MemoryRouter initialEntries={['/bang-diem?match=A72K9P']}>
        <Routes>
          <Route element={<ScoreboardPage />} path="/bang-diem" />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Giải Vô địch Võ thuật' })).toBeVisible();
    expect(screen.getByText('Nhà thi đấu Quận 7')).toBeVisible();
    expect(screen.getByText('Nam 60–65 kg')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Logo Giải Vô địch Võ thuật' })).toHaveAttribute(
      'src',
      expect.stringContaining('events/logo.webp'),
    );
  });

  it('lets viewers choose supervisor credentials and return to match code entry', () => {
    render(
      <MemoryRouter initialEntries={['/bang-diem']}>
        <Routes>
          <Route element={<ScoreboardPage />} path="/bang-diem" />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mã giám sát' }));
    expect(screen.getByLabelText('Mã giải đấu')).toBeVisible();
    expect(screen.getByLabelText('Mã xem bảng điểm của giám sát')).toHaveAttribute(
      'placeholder',
      'VD: GS01',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mã trận đấu' }));
    expect(screen.getByLabelText('Mã trận đấu')).toBeVisible();
  });

  it('renders its connecting state before a realtime snapshot arrives', () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connecting', snapshot: null });
    render(
      <MemoryRouter initialEntries={['/bang-diem?match=9E29BA']}>
        <Routes>
          <Route element={<ScoreboardPage />} path="/bang-diem" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('ĐANG KẾT NỐI')).toHaveLength(2);
    expect(screen.getByText('--:--')).toBeVisible();
  });

  it('renders an authoritative public snapshot and keeps it visible while reconnecting', () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'disconnected', snapshot });
    render(
      <MemoryRouter initialEntries={['/bang-diem?match=A72K9P']}>
        <Routes>
          <Route element={<ScoreboardPage />} path="/bang-diem" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Võ sĩ Đỏ')).toBeVisible();
    expect(screen.getByText('Võ sĩ Xanh')).toBeVisible();
    expect(screen.getByText('ĐANG KẾT NỐI LẠI')).toBeVisible();
    expect(screen.getByLabelText('Điểm Đỏ: 4')).toHaveTextContent('4');
    expect(screen.getByLabelText('Điểm Xanh: 2')).toHaveTextContent('2');
    expect(screen.getByRole('group', { name: 'Lỗi nhẹ: 1 · Lỗi nặng: 0' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Lỗi nhẹ: 2 · Lỗi nặng: 1' })).toBeVisible();
    expect(screen.queryByText(/Chưa công bố kết quả/u)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ảnh của Võ sĩ Đỏ' })).toHaveAttribute(
      'src',
      '/api/media/athletes/red.webp',
    );
    expect(screen.getByRole('img', { name: 'Logo CLB Xanh' })).toHaveAttribute(
      'src',
      '/api/media/organizations/blue.webp',
    );
  });

  it('uses stable placeholders when branding is absent or an image cannot load', () => {
    realtimeMock.mockReturnValue({
      connectionStatus: 'connected',
      snapshot: {
        ...snapshot,
        athletes: snapshot.athletes.map((athlete) => ({
          ...athlete,
          athleteImagePath: null,
          organizationImagePath: null,
        })),
      },
    });
    render(
      <MemoryRouter initialEntries={['/bang-diem?match=A72K9P']}>
        <Routes>
          <Route element={<ScoreboardPage />} path="/bang-diem" />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', { name: 'Chưa có ảnh của Võ sĩ Đỏ' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Chưa có logo clb đỏ' })).toBeVisible();
  });

  it('replaces a failed branding image with its placeholder without changing the panel', () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connected', snapshot });
    render(
      <MemoryRouter initialEntries={['/bang-diem?match=A72K9P']}>
        <Routes>
          <Route element={<ScoreboardPage />} path="/bang-diem" />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Ảnh của Võ sĩ Đỏ' }));
    expect(screen.getByRole('img', { name: 'Chưa có ảnh của Võ sĩ Đỏ' })).toBeVisible();
    expect(screen.getByText('Võ sĩ Đỏ')).toBeVisible();
  });

  it('shows the server-projected intermission countdown only while it remains', () => {
    const intermissionEndsAt = new Date(Date.now() + 30_000).toISOString();
    realtimeMock.mockReturnValue({
      connectionStatus: 'connected',
      snapshot: {
        ...snapshot,
        activeRound: null,
        generatedAt: new Date().toISOString(),
        intermissionEndsAt,
        match: {
          ...snapshot.match,
          intermissionEndsAt,
          phase: MatchStatus.BREAK,
          status: MatchStatus.BREAK,
        },
      } satisfies PublicMatchStatePayload,
    });
    render(
      <MemoryRouter initialEntries={['/bang-diem?match=A72K9P']}>
        <Routes>
          <Route element={<ScoreboardPage />} path="/bang-diem" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Thời gian giải lao giữa hiệp')).toBeVisible();
    expect(screen.getByRole('timer', { name: /giải lao còn lại/u })).toBeVisible();
  });

  it.each([AthleteColor.RED, AthleteColor.BLUE])(
    'shows only the %s winner after publication with that color background',
    (winner) => {
      realtimeMock.mockReturnValue({
        connectionStatus: 'connected',
        snapshot: {
          ...snapshot,
          activeRound: {
            ...(() => {
              if (snapshot.activeRound === null) throw new Error('Expected active round fixture.');
              return snapshot.activeRound;
            })(),
            stage: 'OVERTIME',
            attemptNumber: 2,
          },
          committedScores: { source: 'OVERTIME', attemptNumber: 2, RED: 7, BLUE: 7 },
          match: {
            ...snapshot.match,
            outcome: { winner, method: 'MANUAL_AFTER_OVERTIME_TIE' },
          },
        },
      });
      render(
        <MemoryRouter initialEntries={['/bang-diem?match=A72K9P']}>
          <Routes>
            <Route element={<ScoreboardPage />} path="/bang-diem" />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText('Người chiến thắng')).toBeVisible();
      expect(
        screen.getByText(winner === AthleteColor.RED ? 'Võ sĩ Đỏ' : 'Võ sĩ Xanh'),
      ).toBeVisible();
      expect(
        screen.queryByText(winner === AthleteColor.RED ? 'Võ sĩ Xanh' : 'Võ sĩ Đỏ'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('HIỆP PHỤ LẦN 2')).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: /Lỗi nhẹ/u })).not.toBeInTheDocument();
      expect(screen.queryByText('4')).not.toBeInTheDocument();
      expect(screen.getByText('Quyết định giám sát sau hiệp phụ')).toBeVisible();
      expect(screen.getByLabelText('Kết quả đã công bố').parentElement).toHaveClass(
        winner === AthleteColor.RED ? 'from-red-500' : 'from-sky-500',
      );
    },
  );

  function renderBoard(entry: string) {
    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="location">{location.pathname + location.search}</output>;
    }
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            element={
              <>
                <ScoreboardPage />
                <LocationProbe />
              </>
            }
            path="/bang-diem"
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('opens a normalized match from the selector form', () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connecting', snapshot: null });
    renderBoard('/bang-diem');

    const submit = screen.getByRole('button', { name: 'MỞ BẢNG ĐIỂM' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mã trận đấu'), { target: { value: '  a72k9p ' } });
    fireEvent.click(submit);

    expect(screen.getByTestId('location')).toHaveTextContent('/bang-diem?match=A72K9P');
  });

  it('shows committed scores while the result is not yet published', () => {
    realtimeMock.mockReturnValue({
      connectionStatus: 'connected',
      snapshot: {
        ...snapshot,
        committedScores: { source: 'REGULATION', attemptNumber: null, RED: 5, BLUE: 3 },
      },
    });
    renderBoard('/bang-diem?match=A72K9P');

    expect(
      screen.queryByText('Điểm chung cuộc sau các hiệp chính: Đỏ 5 · Xanh 3'),
    ).not.toBeInTheDocument();
  });

  it('switches to another match and rejects the current one', () => {
    toastMock.mockClear();
    realtimeMock.mockReturnValue({ connectionStatus: 'connected', snapshot });
    renderBoard('/bang-diem?match=A72K9P');

    fireEvent.click(screen.getByRole('button', { name: 'Đổi mã theo dõi' }));
    fireEvent.click(screen.getByRole('button', { name: 'LƯU MÃ THEO DÕI' }));
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Đây là mã trận đấu cũ',
      variant: 'destructive',
    });

    fireEvent.change(screen.getByLabelText('Mã trận đấu'), { target: { value: 'b55x' } });
    fireEvent.click(screen.getByRole('button', { name: 'LƯU MÃ THEO DÕI' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/bang-diem?match=B55X');
  });

  it('uses one switcher for all four transitions between match and supervisor tracking', async () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connected', snapshot });
    vi.spyOn(supervisorScoreboardApi, 'login').mockImplementation((_tournament, code) =>
      Promise.resolve({
        token: code,
        tournamentName: 'Giải võ thuật',
        matchPublicId: code === 'GS01' ? null : 'MATCH2',
      }),
    );
    vi.spyOn(supervisorScoreboardApi, 'state').mockImplementation((token) =>
      Promise.resolve({
        tournamentName: 'Giải võ thuật',
        matchPublicId: token === 'GS01' ? null : 'MATCH2',
      }),
    );
    renderBoard('/bang-diem?match=A72K9P');
    const open = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Đổi mã theo dõi' }));
    };
    const save = () => {
      fireEvent.click(screen.getByRole('button', { name: 'LƯU MÃ THEO DÕI' }));
    };
    // Match -> another match.
    open();
    fireEvent.change(screen.getByLabelText('Mã trận đấu'), { target: { value: 'B55X' } });
    save();
    expect(screen.getByTestId('location')).toHaveTextContent('match=B55X');
    // Match -> supervisor with no current match.
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Mã giám sát' }));
    fireEvent.change(screen.getByLabelText('Mã giải đấu'), { target: { value: 'GIAI' } });
    fireEvent.change(screen.getByLabelText('Mã xem bảng điểm của giám sát'), {
      target: { value: 'GS01' },
    });
    save();
    expect(await screen.findByText('Trận đấu chưa bắt đầu')).toBeVisible();
    expect(screen.getAllByLabelText('Thông tin bảng điểm')).toHaveLength(1);
    expect(screen.getByText('GS01')).toBeVisible();
    // Supervisor -> another supervisor, keeping tournament prefilled.
    open();
    expect(screen.getByLabelText('Mã giải đấu')).toHaveValue('GIAI');
    fireEvent.change(screen.getByLabelText('Mã xem bảng điểm của giám sát'), {
      target: { value: 'GS02' },
    });
    save();
    expect(await screen.findByText('GS02')).toBeVisible();
    await waitFor(() => {
      expect(realtimeMock).toHaveBeenLastCalledWith('MATCH2');
    });
    expect(screen.queryByText('Trận đấu chưa bắt đầu')).not.toBeInTheDocument();
    // Supervisor -> match.
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Mã trận đấu' }));
    fireEvent.change(screen.getByLabelText('Mã trận đấu'), { target: { value: 'C77X' } });
    save();
    expect(screen.getByTestId('location')).toHaveTextContent('match=C77X');
    expect(screen.getByText('C77X')).toBeVisible();
    expect(screen.queryByText('GS02')).not.toBeInTheDocument();
  });

  it('uses exactly one shared header for supervisor tracking and shows tracking connection loss there', async () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connected', snapshot });
    vi.spyOn(supervisorScoreboardApi, 'login').mockResolvedValue({
      token: 'GS01',
      tournamentName: 'Giải',
      matchPublicId: 'A72K9P',
    });
    vi.spyOn(supervisorScoreboardApi, 'state').mockRejectedValue(new Error('offline'));
    renderBoard('/bang-diem');
    fireEvent.click(screen.getByRole('button', { name: 'Mã giám sát' }));
    fireEvent.change(screen.getByLabelText('Mã giải đấu'), { target: { value: 'GIAI' } });
    fireEvent.change(screen.getByLabelText('Mã xem bảng điểm của giám sát'), {
      target: { value: 'GS01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'MỞ BẢNG ĐIỂM' }));
    expect(await screen.findByText('GS01')).toBeVisible();
    expect(screen.getAllByLabelText('Thông tin bảng điểm')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Đổi mã theo dõi' })).toHaveLength(1);
    expect(screen.getByText('Võ sĩ Đỏ')).toBeVisible();
    expect(await screen.findByText('ĐANG KẾT NỐI LẠI')).toBeVisible();
    expect(screen.getByRole('main')).toHaveClass('scoreboard-screen');
    expect(screen.queryByText(/Theo dõi giám sát/)).not.toBeInTheDocument();
  });

  it('keeps the current match visible when supervisor access fails and when the dialog is cancelled', async () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connected', snapshot });
    vi.spyOn(supervisorScoreboardApi, 'login').mockRejectedValue(new Error('invalid code'));
    renderBoard('/bang-diem?match=A72K9P');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mã theo dõi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mã giám sát' }));
    fireEvent.change(screen.getByLabelText('Mã giải đấu'), { target: { value: 'GIAI' } });
    fireEvent.change(screen.getByLabelText('Mã xem bảng điểm của giám sát'), {
      target: { value: 'BAD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'LƯU MÃ THEO DÕI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('kiểm tra mã giải đấu, mã giám sát');
    expect(screen.getByText('Võ sĩ Đỏ')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('match=A72K9P');
  });

  it('keeps the dialog open while validating a supervisor code, then switches after success', async () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connected', snapshot });
    let complete:
      ((value: { token: string; tournamentName: string; matchPublicId: null }) => void) | undefined;
    vi.spyOn(supervisorScoreboardApi, 'login').mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    vi.spyOn(supervisorScoreboardApi, 'state').mockResolvedValue({
      tournamentName: 'Giải',
      matchPublicId: null,
    });
    renderBoard('/bang-diem?match=A72K9P');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mã theo dõi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mã giám sát' }));
    fireEvent.change(screen.getByLabelText('Mã giải đấu'), { target: { value: 'GIAI' } });
    fireEvent.change(screen.getByLabelText('Mã xem bảng điểm của giám sát'), {
      target: { value: 'GS01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'LƯU MÃ THEO DÕI' }));
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText('Võ sĩ Đỏ')).toBeVisible();
    await act(async () => {
      complete?.({ token: 'GS01', tournamentName: 'Giải', matchPublicId: null });
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Trận đấu chưa bắt đầu')).toBeVisible();
  });

  it('restores supervisor tracking if a manually entered match code is invalid', async () => {
    vi.spyOn(supervisorScoreboardApi, 'login').mockResolvedValue({
      token: 'GS01',
      tournamentName: 'Giải',
      matchPublicId: null,
    });
    vi.spyOn(supervisorScoreboardApi, 'state').mockResolvedValue({
      tournamentName: 'Giải',
      matchPublicId: null,
    });
    renderBoard('/bang-diem');
    fireEvent.click(screen.getByRole('button', { name: 'Mã giám sát' }));
    fireEvent.change(screen.getByLabelText('Mã giải đấu'), { target: { value: 'GIAI' } });
    fireEvent.change(screen.getByLabelText('Mã xem bảng điểm của giám sát'), {
      target: { value: 'GS01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'MỞ BẢNG ĐIỂM' }));
    expect(await screen.findByText('GS01')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mã theo dõi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mã trận đấu' }));
    fireEvent.change(screen.getByLabelText('Mã trận đấu'), { target: { value: 'INVALID' } });
    realtimeMock.mockReturnValue({ connectionStatus: 'disconnected', snapshot: null });
    fireEvent.click(screen.getByRole('button', { name: 'LƯU MÃ THEO DÕI' }));
    expect(await screen.findByText('GS01')).toBeVisible();
    expect(screen.getByText('Trận đấu chưa bắt đầu')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/bang-diem');
    expect(screen.getByTestId('location')).not.toHaveTextContent('match=INVALID');
  });

  it('cancels match editing with Escape', () => {
    realtimeMock.mockReturnValue({ connectionStatus: 'connected', snapshot });
    renderBoard('/bang-diem?match=A72K9P');

    const switchButton = screen.getByRole('button', { name: 'Đổi mã theo dõi' });
    switchButton.focus();
    fireEvent.click(switchButton);
    fireEvent.keyDown(screen.getByLabelText('Mã trận đấu'), { key: 'Escape' });

    expect(screen.queryByLabelText('Mã trận đấu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đổi mã theo dõi' })).toHaveFocus();
    expect(screen.getByText('A72K9P')).toBeVisible();
  });

  it('colours each judge cell with that judge vote right after a window resolves', () => {
    realtimeMock.mockReturnValue({
      connectionStatus: 'connected',
      snapshot: {
        ...snapshot,
        generatedAt: '2030-01-01T00:00:11.000Z',
        judgeVotes: {
          judgeCount: 3,
          lastResolvedWindow: {
            resolvedAt: '2030-01-01T00:00:10.000Z',
            winningColor: null,
            votes: [
              { judgePosition: 1, athlete: AthleteColor.RED },
              { judgePosition: 3, athlete: AthleteColor.BLUE },
            ],
          },
        },
      },
    });
    renderBoard('/bang-diem?match=A72K9P');

    expect(screen.getByLabelText('Giám định 1: Đỏ')).toHaveAttribute('data-vote', 'RED');
    expect(screen.getByLabelText('Giám định 2: không chọn')).toHaveAttribute('data-vote', 'NONE');
    expect(screen.getByLabelText('Giám định 3: Xanh')).toHaveAttribute('data-vote', 'BLUE');
    expect(screen.getByText('Không đủ đa số — không cộng điểm')).toBeVisible();
  });

  it('leaves judge cells neutral when the last window resolved long ago', () => {
    realtimeMock.mockReturnValue({
      connectionStatus: 'connected',
      snapshot: {
        ...snapshot,
        generatedAt: '2030-01-01T00:01:00.000Z',
        judgeVotes: {
          judgeCount: 3,
          lastResolvedWindow: {
            resolvedAt: '2030-01-01T00:00:10.000Z',
            winningColor: AthleteColor.RED,
            votes: [{ judgePosition: 1, athlete: AthleteColor.RED }],
          },
        },
      },
    });
    renderBoard('/bang-diem?match=A72K9P');

    expect(screen.getByLabelText('Giám định 1: không chọn')).toBeVisible();
    expect(screen.queryByText('Cộng điểm cho ĐỎ')).not.toBeInTheDocument();
  });
});
