import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AthleteColor } from '@martial-arts-scoring/shared-types';
import { RefereeConsole } from './referee-console';
import {
  acceptedRedVote,
  createRealtimeState,
  createMatchSnapshot,
  refereeSession,
} from '@/test/factories';

describe('RefereeConsole', () => {
  it('only presents a vote as recorded after the accepted-vote state arrives', () => {
    const { rerender } = render(
      <RefereeConsole
        realtime={createRealtimeState({ submittingVote: AthleteColor.RED })}
        session={refereeSession}
      />,
    );

    expect(screen.getByText('Đã gửi lựa chọn RED; đang chờ máy chủ xác nhận.')).toBeVisible();
    expect(screen.queryByText(/Máy chủ đã ghi nhận lựa chọn/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Chấm điểm BLUE/i })).toBeDisabled();

    rerender(
      <RefereeConsole
        realtime={createRealtimeState({ lastAcceptedVote: acceptedRedVote })}
        session={refereeSession}
      />,
    );

    expect(screen.getByText(/Máy chủ đã ghi nhận lựa chọn RED/)).toBeVisible();
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Chấm điểm BLUE/i })).toBeDisabled();
  });

  it('prevents another vote after an accepted vote and enables both controls for a new window', async () => {
    const user = userEvent.setup();
    const submitVote = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <RefereeConsole
        realtime={createRealtimeState({ lastAcceptedVote: acceptedRedVote, submitVote })}
        session={refereeSession}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Chấm điểm BLUE/i }));
    expect(submitVote).not.toHaveBeenCalled();

    rerender(
      <RefereeConsole
        realtime={createRealtimeState({
          snapshot: createMatchSnapshot({
            activeScoringWindow: null,
          }),
          submitVote,
        })}
        session={refereeSession}
      />,
    );

    const redButton = screen.getByRole('button', { name: /Chấm điểm RED/i });
    const blueButton = screen.getByRole('button', { name: /Chấm điểm BLUE/i });
    expect(redButton).toBeEnabled();
    expect(blueButton).toBeEnabled();

    await user.click(blueButton);
    expect(submitVote).toHaveBeenCalledExactlyOnceWith(AthleteColor.BLUE);
  });

  it.each([
    ['disconnected', 'Mất kết nối'],
    ['reconnecting', 'Đang kết nối lại'],
  ] as const)('shows %s as %s and disables voting', (connectionStatus, label) => {
    render(
      <RefereeConsole
        realtime={createRealtimeState({ connectionStatus })}
        session={refereeSession}
      />,
    );

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Chấm điểm BLUE/i })).toBeDisabled();
  });
});
