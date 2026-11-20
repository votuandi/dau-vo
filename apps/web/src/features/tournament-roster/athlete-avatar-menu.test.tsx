import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AthleteAvatarMenu } from './athlete-avatar-menu';

function renderMenu(readOnly = false) {
  const onFileSelected = vi.fn();
  render(
    <div>
      <p>Bên ngoài</p>
      <AthleteAvatarMenu
        busy={false}
        imageUrl="/api/media/athletes/a.png"
        name="Nguyễn An"
        onFileSelected={onFileSelected}
        readOnly={readOnly}
      />
    </div>,
  );
  return { onFileSelected };
}

describe('AthleteAvatarMenu', () => {
  it('shows the change option on avatar click and hides it on an outside click', async () => {
    const user = userEvent.setup();
    renderMenu();
    expect(screen.queryByRole('menuitem')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện Nguyễn An' }));
    expect(screen.getByRole('menuitem', { name: 'Thay đổi ảnh đại diện' })).toBeVisible();
    await user.click(screen.getByText('Bên ngoài'));
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện Nguyễn An' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('opens the file picker from the option and reports the chosen image', async () => {
    const user = userEvent.setup();
    const { onFileSelected } = renderMenu();
    const input = screen.getByLabelText('Chọn ảnh đại diện mới cho Nguyễn An');
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: 'Ảnh đại diện Nguyễn An' }));
    await user.click(screen.getByRole('menuitem', { name: 'Thay đổi ảnh đại diện' }));
    expect(click).toHaveBeenCalled();
    expect(screen.queryByRole('menuitem')).toBeNull();
    const file = new File(['x'], 'new.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('is a plain image when read-only', () => {
    renderMenu(true);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Ảnh đại diện Nguyễn An' })).toBeVisible();
  });
});
