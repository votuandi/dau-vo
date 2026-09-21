import { render, screen } from '@testing-library/react';
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
    id: 'round-1',
    pausedAt: null,
    remainingDurationMs: null,
    roundNumber: 1,
    startedAt: '2030-01-01T00:00:00.000Z',
  },
  athletes: [
    { color: AthleteColor.RED, name: 'Võ sĩ Đỏ', organization: 'CLB Đỏ', score: 4, violations: 1 },
    {
      color: AthleteColor.BLUE,
      name: 'Võ sĩ Xanh',
      organization: 'CLB Xanh',
      score: 2,
      violations: 3,
    },
  ],
  completion: { canComplete: false, blockedReasons: ['ROUND_1_NOT_ENDED', 'ROUND_2_NOT_ENDED'] },
  generatedAt: '2030-01-01T00:00:00.000Z',
  match: {
    currentRound: 1,
    finishedAt: null,
    lifecycle: MatchLifecycle.IN_PROGRESS,
    phase: MatchStatus.ROUND_1_RUNNING,
    publicId: 'A72K9P',
    status: MatchStatus.ROUND_1_RUNNING,
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
    expect(screen.getByText('Lỗi: 1')).toBeVisible();
    expect(screen.getByText('Lỗi: 3')).toBeVisible();
  });
});
