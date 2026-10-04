import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AppLayout } from '@/layouts/app-layout';
import { HomePage } from './home-page';

it('hydrates the public homepage without session providers or redirecting to login', () => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(<HomePage />);
  document.body.append(container);
  const errors = vi.spyOn(console, 'error');
  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { container, hydrate: true },
  );
  try {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Nền tảng chấm điểm võ thuật và võ gậy',
    );
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Vào nền tảng' })).toHaveAttribute(
      'href',
      '/workspace',
    );
    expect(errors).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    container.remove();
    errors.mockRestore();
  }
});
