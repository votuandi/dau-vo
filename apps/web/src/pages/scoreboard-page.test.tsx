import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  AthleteColor,
  MatchLifecycle,
  MatchStatus,
  type PublicMatchStatePayload,
} from '@martial-arts-scoring/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { ScoreboardPage } from './scoreboard-page';

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

describe('ScoreboardPage', () => {
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
    expect(screen.getAllByText('4')).toHaveLength(1);
    expect(screen.getAllByText('2')).toHaveLength(1);
    expect(screen.getByText('Lỗi nhẹ: 1 · Lỗi nặng: 0')).toBeVisible();
    expect(screen.getByText('Lỗi nhẹ: 2 · Lỗi nặng: 1')).toBeVisible();
    expect(screen.getByText(/Chưa công bố kết quả/u)).toBeVisible();
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
      expect(screen.queryByText('Lỗi nhẹ: 1 · Lỗi nặng: 0')).not.toBeInTheDocument();
      expect(screen.queryByText('4')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Kết quả đã công bố').parentElement).toHaveClass(
        winner === AthleteColor.RED ? 'from-red-500' : 'from-sky-500',
      );
    },
  );
});
