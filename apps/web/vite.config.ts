import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const sharedTypesSource = fileURLToPath(
  new URL('../../packages/shared-types/src/index.ts', import.meta.url),
);

function environmentValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();

  if (normalized === undefined || normalized.length === 0) {
    return fallback;
  }

  return normalized;
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, workspaceRoot, '');
  const apiPort = environmentValue(environment.API_PORT, '3000');
  const backendTarget = environmentValue(
    environment.VITE_DEV_SERVER_TARGET,
    `http://localhost:${apiPort}`,
  );

  return {
    build: {
      commonjsOptions: {
        include: [/node_modules/, /packages[\\/]shared-types[\\/]dist/],
      },
    },
    envDir: workspaceRoot,
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // Resolve this workspace package from source.  Pre-bundling its dist
        // output can leave a running dev server with stale runtime exports.
        '@martial-arts-scoring/shared-types': sharedTypesSource,
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          changeOrigin: true,
          target: backendTarget,
          ws: true,
        },
      },
    },
  };
});
