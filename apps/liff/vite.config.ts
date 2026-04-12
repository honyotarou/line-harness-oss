import { validateClientApiBaseUrl } from '@line-crm/shared/safe-api-base-url';
import { defineConfig, loadEnv } from 'vite';
import { assertLiffProductionApiUrl } from './src/build-env-guard.js';

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function buildLiffContentSecurityPolicy(apiBase: string): string {
  let connect = "'self' https://api.line.me";
  const v = validateClientApiBaseUrl(apiBase, { allowPlaceholderTemplate: false });
  if (v.ok) {
    connect = `'self' ${v.normalizedOrigin} https://api.line.me`;
  }
  return [
    "default-src 'self'",
    "script-src 'self' https://static.line-scdn.net",
    "style-src 'self'",
    `connect-src ${connect}`,
    "img-src 'self' data: blob: https://*.line-scdn.net",
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'self' https://line.me https://liff.line.me",
    'upgrade-insecure-requests',
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  assertLiffProductionApiUrl(mode, env.VITE_API_URL, process.env);
  const apiBase = (env.VITE_API_URL ?? '').trim();
  const liffCsp = buildLiffContentSecurityPolicy(apiBase);

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
          return html
            .replace(
              '<meta name="lh-api-base" content="" />',
              `<meta name="lh-api-base" content="${escapeHtmlAttr(apiBase)}" />`,
            )
            .replace(
              '<meta http-equiv="Content-Security-Policy" content="" />',
              `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(liffCsp)}" />`,
            );
        },
      },
    ],
  };
});
