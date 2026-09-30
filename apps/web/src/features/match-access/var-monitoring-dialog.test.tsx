import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ varMonitoring: vi.fn() }));
vi.mock('@/services/api/official-access', () => ({ officialAccessApi: api }));

import { VarMonitoringDialog } from './var-monitoring-dialog';

const empty = { auditLogs: [], penalties: [], scoreEvents: [], scoringWindows: [] };

describe('VarMonitoringDialog', () => {
  it('renders all four read-only history sections and their empty states', async () => {
    api.varMonitoring.mockResolvedValueOnce(empty);
    render(<VarMonitoringDialog matchId="match-1" onClose={vi.fn()} />);
    expect(screen.getByText('Đang tải dữ liệu VAR…')).toBeVisible();
    await screen.findByText('Lịch sử cửa sổ chấm điểm (0)');
    expect(screen.getByText('Lỗi phạt (0)')).toBeVisible();
    expect(screen.getByText('Score events (0)')).toBeVisible();
    expect(screen.getByText('Audit logs (0)')).toBeVisible();
    expect(screen.getAllByText(/Chưa có/u)).toHaveLength(4);
  });

  it('surfaces fetch failure and retries without any mutation control', async () => {
    const user = userEvent.setup();
    api.varMonitoring.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(empty);
    render(<VarMonitoringDialog matchId="match-1" onClose={vi.fn()} />);
    await screen.findByRole('alert');
    expect(screen.getByText('Không thể tải dữ liệu VAR.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(api.varMonitoring).toHaveBeenCalledTimes(2));
    await screen.findByText('Audit logs (0)');
    expect(screen.queryByRole('button', { name: /lưu|xác nhận|phạt/i })).not.toBeInTheDocument();
  });
});
