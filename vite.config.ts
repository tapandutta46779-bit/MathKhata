import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command, mode }) => ({
  base: './',
  plugins: [
    react(),
    {
      name: 'mathkhata-csp',
      transformIndexHtml(html) {
        const scriptSources = command !== 'serve' && mode === 'web'
          ? "'self' https://static.cloudflareinsights.com/beacon.min.js"
          : "'self'";
        const connectSources = command === 'serve'
          ? "'self' http://127.0.0.1:11434 http://localhost:11434 ws://127.0.0.1:4173"
          : "'self'";
        return html
          .replace('__MATHKHATA_SCRIPT_SRC__', scriptSources)
          .replace('__MATHKHATA_CONNECT_SRC__', connectSources);
      },
    },
  ],
  resolve: mode === 'web' ? {
    alias: [
      {
        find: '../voice/desktopSpeechProvider',
        replacement: fileURLToPath(new URL('./src/voice/desktopSpeechProvider.web.ts', import.meta.url)),
      },
    ],
  } : undefined,
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
}));
