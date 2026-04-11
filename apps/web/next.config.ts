import type { NextConfig } from 'next';
import { buildAdminContentSecurityPolicy } from './src/security/csp-policy';

/**
 * HTTP headers for `next dev` and Playwright. With `output: 'export'`, `next build` does not attach
 * these to exported files — use `vercel.json` (or host config) for production static hosting.
 */
const isNextDev = process.env.NODE_ENV === 'development';

const ADMIN_SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: buildAdminContentSecurityPolicy({
      allowUnsafeEval: isNextDev,
      narrowConnectSrcFromApiUrl: process.env.NEXT_PUBLIC_API_URL,
    }),
  },
  ...(isNextDev
    ? ([] as const)
    : ([
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains; preload',
        },
        { key: 'X-Frame-Options', value: 'DENY' },
      ] as const)),
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
] as const;

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'export',
  transpilePackages: ['@line-crm/shared'],
  async headers() {
    return [{ source: '/:path*', headers: [...ADMIN_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
