import type { Context, ExecutionContext, Hono, Next } from 'hono';
import {
  isEligibleWorkerAdminProxyTargetPath,
  stripAdminAccessProxyPrefix,
} from '@line-crm/shared';
import type { Env } from '../index.js';
import { canonicalRequestPathname } from '../services/auth-paths.js';

/**
 * When the line-crm Worker is reached with the same-origin BFF prefix still on the path
 * (e.g. misrouted `GET /api/lh-upstream/api/auth/session`), strip it once and re-dispatch so
 * {@link isAuthExemptPath} and route mounts see `/api/...`.
 *
 * @param prefixEnv {@link Env.Bindings.ADMIN_INBOUND_BFF_PATH_PREFIX}
 * @returns rewritten pathname, or `null` when no rewrite applies
 */
export function resolveAdminBffInboundRewritePathname(
  pathname: string,
  prefixEnv: string | undefined,
): string | null {
  if (prefixEnv !== undefined && prefixEnv.trim() === '') {
    return null;
  }
  const raw = prefixEnv?.trim() || '/api/lh-upstream';
  const prefix = raw.replace(/\/+$/, '') || '/api/lh-upstream';
  const canonical = canonicalRequestPathname(pathname);
  const stripped = stripAdminAccessProxyPrefix(canonical, prefix);
  if (stripped === null) {
    return null;
  }
  if (!isEligibleWorkerAdminProxyTargetPath(stripped)) {
    return null;
  }
  return stripped;
}

function optionalExecutionContext(c: Context<Env>): ExecutionContext | undefined {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

/**
 * Runs before host/auth middleware. Re-invokes the app with a rewritten URL when the request
 * targets an eligible `/api/...` path behind the configured BFF prefix.
 */
export function createAdminBffInboundPathRewrite(app: Hono<Env>) {
  return async (c: Context<Env>, next: Next): Promise<Response | void> => {
    const url = new URL(c.req.url);
    const nextPath = resolveAdminBffInboundRewritePathname(
      url.pathname,
      c.env.ADMIN_INBOUND_BFF_PATH_PREFIX,
    );
    if (nextPath === null) {
      return next();
    }

    url.pathname = nextPath;
    const forwarded = new Request(url.toString(), c.req.raw);
    const executionCtx = optionalExecutionContext(c);
    return executionCtx === undefined
      ? app.fetch(forwarded, c.env)
      : app.fetch(forwarded, c.env, executionCtx);
  };
}
