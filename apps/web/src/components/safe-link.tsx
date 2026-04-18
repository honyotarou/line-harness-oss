'use client';

import NextLink from 'next/link';
import type { ComponentProps } from 'react';

export type SafeLinkProps = ComponentProps<typeof NextLink>;

/**
 * Wrapper around `next/link` that **defaults `prefetch` to `false`**.
 *
 * When Cloudflare Access protects the **entire** admin hostname, Next.js RSC viewport prefetch
 * (`*.txt?_rsc=…` with `next-router-state-tree` / `rsc` request headers) can follow a 302 to
 * `*.cloudflareaccess.com` and then fail CORS preflight (`OPTIONS` → 403 on the login URL).
 * Disabling prefetch avoids issuing those speculative fetches from `Link`.
 *
 * Prefer tightening the Cloudflare Access **Application path** to `/api/lh-upstream/*` only at
 * the edge; this component is the app-side safety net when the policy covers the whole admin host.
 */
export default function SafeLink({ prefetch = false, ...rest }: SafeLinkProps) {
  return <NextLink prefetch={prefetch} {...rest} />;
}
