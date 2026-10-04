import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers/app-providers';
import { router } from '@/app/router/router';
import '@/styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Unable to find the application root element.');
}

const app = (
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);

if (rootElement.dataset.prerendered === 'true' && window.location.pathname === '/') {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
