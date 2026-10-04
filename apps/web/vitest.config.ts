import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Build-output checks use node:test after build, through test:build in CI.
    exclude: [...configDefaults.exclude, 'scripts/**'],
    clearMocks: true,
    environment: 'jsdom',
    mockReset: true,
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
