import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export default defineConfig(({ command, mode }) => ({
  base: './',
  plugins: [
    react(),
    {
      name: 'mathkhata-offline-assets',
      apply: 'build',
      generateBundle(_options, bundle) {
        this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: readFileSync(new URL('./LICENSE', import.meta.url), 'utf8') });
        const lock = JSON.parse(readFileSync(new URL('./package-lock.json', import.meta.url), 'utf8'));
        const notices = ['Math Notebook third-party notices\nDependencies retain their own licenses. Downloaded AI models are not relicensed by this file.\n'];
        for (const [path, metadata] of Object.entries(lock.packages) as Array<[string, { dev?: boolean; version?: string; license?: string }]>) {
          if (!path || metadata.dev) continue;
          const directory = new URL(`./${path}/`, import.meta.url);
          if (!existsSync(directory)) continue;
          notices.push(`\n===== ${path} ${metadata.version ?? ''} (${metadata.license ?? 'See package license'}) =====\n`);
          for (const file of readdirSync(directory).filter((name) => /^(license|copying|notice)(\.[\w-]+)?$/i.test(name))) {
            notices.push(readFileSync(new URL(file, directory), 'utf8'));
          }
        }
        this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source: notices.join('\n') });
        const assets = Object.keys(bundle)
          .filter((fileName) => !fileName.endsWith('.map'))
          .map((fileName) => `./${fileName}`)
          .sort();
        this.emitFile({
          type: 'asset',
          fileName: 'offline-assets.json',
          source: JSON.stringify({ assets }),
        });
      },
    },
    {
      name: 'mathkhata-csp',
      transformIndexHtml(html) {
        const scriptSources = command !== 'serve' && mode === 'web'
          ? "'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com/beacon.min.js"
          : "'self'";
        const connectSources = command === 'serve'
          ? "'self' http://127.0.0.1:11434 http://localhost:11434 ws://127.0.0.1:4173"
          : mode === 'web'
            ? "'self' https://cloudflareinsights.com https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co https://raw.githubusercontent.com"
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
