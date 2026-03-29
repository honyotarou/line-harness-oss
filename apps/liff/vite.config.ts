import { defineConfig, loadEnv } from 'vite';
import { assertLiffProductionApiUrl } from './src/build-env-guard.js';

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  assertLiffProductionApiUrl(mode, env.VITE_API_URL, process.env);
  const apiBase = (env.VITE_API_URL ?? '').trim();

  return {
    root: '.',
    build: {
      outDir: 'dist',
    },
    server: {
      port: 3002,
    },
    plugins: [
      {
        name: 'lh-inject-api-meta',
        transformIndexHtml(html) {
          return html.replace(
            '<meta name="lh-api-base" content="" />',
            `<meta name="lh-api-base" content="${escapeHtmlAttr(apiBase)}" />`,
          );
        },
      },
    ],
  };
});
