import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MatchAccessRole } from '@/types/shared';
import { GeneratedAccessCodesPanel } from './generated-access-codes-panel';

const accessCodes = [
  { role: MatchAccessRole.REFEREE_1, code: 'REF1-ABCD-EFGH-JKLM' },
  { role: MatchAccessRole.INSPECTOR, code: 'INSP-ABCD-EFGH-JKLM' },
] as const;

function renderPanel() {
  render(
    <GeneratedAccessCodesPanel
      accessCodes={accessCodes}
      matchPublicId="A72K9P"
      onDismiss={vi.fn()}
    />,
  );
}

describe('GeneratedAccessCodesPanel', () => {
  it('copies the match ID and the selected referee or adjudicator credentials', async () => {
    const user = userEvent.setup();
    renderPanel();

    const refereeCopyButton = screen.getByRole('button', {
      name: 'Sao chép thông tin Trọng tài 1',
    });
    await user.click(refereeCopyButton);

    expect(await navigator.clipboard.readText()).toBe(
      ['Mã trận đấu: A72K9P', 'Vai trò: Trọng tài 1', 'Mã truy cập: REF1-ABCD-EFGH-JKLM'].join(
        '\n',
      ),
    );
    expect(within(refereeCopyButton).getByText('Đã sao chép')).toBeVisible();

    const inspectorCopyButton = screen.getByRole('button', {
      name: 'Sao chép thông tin Giám định viên',
    });
    await user.click(inspectorCopyButton);

    expect(await navigator.clipboard.readText()).toBe(
      [
        'Mã trận đấu: A72K9P',
        'Vai trò: Giám định viên',
        'Mã truy cập: INSP-ABCD-EFGH-JKLM',
      ].join('\n'),
    );
    expect(within(inspectorCopyButton).getByText('Đã sao chép')).toBeVisible();
  });

  it('shows an error state when clipboard access is rejected', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
      new Error('Clipboard permission denied.'),
    );
    renderPanel();

    const copyButton = screen.getByRole('button', {
      name: 'Sao chép thông tin Trọng tài 1',
    });
    await user.click(copyButton);

    expect(within(copyButton).getByText('Không thể sao chép')).toBeVisible();
  });

  it('renders nothing when no plaintext access code is available', () => {
    const { container } = render(
      <GeneratedAccessCodesPanel accessCodes={[]} matchPublicId="A72K9P" onDismiss={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
