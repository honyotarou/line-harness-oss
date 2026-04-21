import type { Friend, Tag } from '@line-crm/shared';
import type { Broadcast } from '@line-crm/shared';
import {
  ADMIN_BROWSER_CLIENT_HEADER,
  ADMIN_BROWSER_CLIENT_HEADER_VALUE,
} from '@line-crm/shared/admin-browser-client';
import { validateAdminApiFetchBase } from '@line-crm/shared';
import {
  allowAdminApiUrlPlaceholderTemplate,
  getAdminBrowserApiFetchBase,
  getAdminWorkerApiOrigin,
  isAdminCloudflareAccessLoginEnabled,
} from '../admin-public-config.js';
import {
  adminAccessDocumentRedirectAlreadyHandledBody,
  adminAuthFetchFailureBody,
  getBrowserAdminAuthCompletionRedirectTarget,
  isBrowserAdminAuthApiPath,
  isBrowserAdminManagedApiPath,
  resolveBrowserFetchRedirectPolicy,
  shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect,
  shouldTreatBrowserAuthResponseAsSsoRedirect,
} from './admin-auth-fetch-policy.js';
import { tryClaimAdminAccessDocumentRedirect } from './admin-access-document-redirect-mutex.js';
import {
  clearAllEdgeAuthSsoReloadPersistence,
  consumeBrowserEdgeAuthSsoReloadSlot,
  EDGE_AUTH_RELOAD_LOGIN_KEY,
  EDGE_AUTH_RELOAD_SESSION_KEY,
} from './edge-auth-sso-reload-gate.js';

/** Broadcast type from API (now camelCase after worker serialization) */
export type ApiBroadcast = Broadcast;

/** `1` / `true` / `yes` / `on`: POST `/api/auth/login` with `{}`; Cloudflare Access must forward `Cf-Access-Jwt-Assertion` to the Worker. */
export function useCloudflareAccessLoginMode(): boolean {
  return isAdminCloudflareAccessLoginEnabled();
}

/** Cross-origin admin (e.g. Vercel → workers.dev): browsers may not store/send API cookie; Bearer carries the same session token. */
const ADMIN_SESSION_STORAGE_KEY = 'lh_admin_session_token';

/** Re-exported from `@line-crm/shared` — must match Worker CORS and CSRF middleware. */
export { ADMIN_BROWSER_CLIENT_HEADER, ADMIN_BROWSER_CLIENT_HEADER_VALUE };

/** Worker origin (same as API). Use for LIFF/auth links so demo URLs are not hardcoded in the UI. */
export function getApiBaseUrl(): string {
  return getAdminWorkerApiOrigin();
}

function resolveApiUrl(): string {
  return getAdminBrowserApiFetchBase();
}

function getStoredAdminSessionToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminSessionToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, token);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearAdminSessionToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function bearerForRequest(path: string, method: string): Record<string, string> {
  if (method === 'POST' && path === '/api/auth/login') {
    return {};
  }
  const t = getStoredAdminSessionToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export type ApiError = Error &
  Readonly<{
    name: 'ApiError';
    status: number;
    body?: unknown;
  }>;

export function createApiError(message: string, status: number, body?: unknown): ApiError {
  return Object.assign(new Error(message), {
    name: 'ApiError' as const,
    status,
    ...(body === undefined ? {} : { body }),
  });
}

export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof Error &&
    err.name === 'ApiError' &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}

function apiBaseUrlValidationOptions(): { allowPlaceholderTemplate?: boolean } {
  return { allowPlaceholderTemplate: allowAdminApiUrlPlaceholderTemplate() };
}

function edgeAuthReloadFlagKey(path: string, method: string): string | null {
  if (path === '/api/auth/session' && method === 'GET') {
    return EDGE_AUTH_RELOAD_SESSION_KEY;
  }
  if (path === '/api/auth/login' && method === 'POST') {
    return EDGE_AUTH_RELOAD_LOGIN_KEY;
  }
  return null;
}

function clearEdgeAuthReloadFlags(): void {
  clearAllEdgeAuthSsoReloadPersistence();
}

/** Testable HTTP helper: all browser `fetchApi` calls go through here. */
export async function fetchApiCore<T>(
  baseUrl: string,
  fetchImpl: typeof fetch,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const validated = validateAdminApiFetchBase(baseUrl, apiBaseUrlValidationOptions());
  if (!validated.ok) {
    throw createApiError(`Misconfigured API URL: ${validated.reason}`, 503);
  }
  const fetchBase = validated.fetchBase;

  const browserClientValue =
    (typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_ADMIN_BROWSER_CLIENT_TOKEN?.trim()) ||
    ADMIN_BROWSER_CLIENT_HEADER_VALUE;
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
    'Content-Type': 'application/json',
    [ADMIN_BROWSER_CLIENT_HEADER]: browserClientValue,
  };
  const method = (options?.method ?? 'GET').toUpperCase();
  const redirect = resolveBrowserFetchRedirectPolicy(path, options);
  const res = await fetchImpl(`${fetchBase}${path}`, {
    ...options,
    credentials: 'include',
    headers,
    redirect,
  });
  const treatAsSsoRedirect = isBrowserAdminAuthApiPath(path)
    ? shouldTreatBrowserAuthResponseAsSsoRedirect(res)
    : shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect(res);
  const authCompletionRedirectTarget = isBrowserAdminAuthApiPath(path)
    ? getBrowserAdminAuthCompletionRedirectTarget(res)
    : null;

  if (authCompletionRedirectTarget) {
    clearEdgeAuthReloadFlags();
    if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
      const loc = (globalThis as { location?: { replace?: (url: string) => void } }).location;
      if (loc && typeof loc.replace === 'function') {
        loc.replace(authCompletionRedirectTarget);
        return new Promise(() => {
          /* never resolves — top-level navigation for login completion */
        });
      }
    }
    throw createApiError(
      'Admin auth API returned login completion redirect (no window.location.replace).',
      401,
      adminAuthFetchFailureBody(),
    );
  }

  if (isBrowserAdminManagedApiPath(path) && treatAsSsoRedirect) {
    if (!isBrowserAdminAuthApiPath(path)) {
      if (!tryClaimAdminAccessDocumentRedirect()) {
        throw createApiError(
          'Admin API Access document redirect already claimed by a parallel request.',
          401,
          adminAccessDocumentRedirectAlreadyHandledBody(),
        );
      }
      if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
        const loc = (globalThis as { location?: { replace?: (url: string) => void } }).location;
        if (loc && typeof loc.replace === 'function') {
          // `/` would re-mount the dashboard and re-fire parallel `/api/*`; `/login` is the terminal UX for Access.
          loc.replace('/login');
          return new Promise(() => {
            /* never resolves — top-level navigation for Access document login */
          });
        }
      }
      throw createApiError(
        'Admin API returned Access login redirect (no window.location.replace).',
        401,
        adminAuthFetchFailureBody(),
      );
    }
    const flagKey = edgeAuthReloadFlagKey(path, method);
    if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
      type EdgeAuthLocation = Readonly<{
        readonly href?: string;
        pathname?: string;
        search?: string;
        hash?: string;
        replace?: (url: string) => void;
        reload?: () => void;
      }>;
      const loc = (globalThis as { location?: EdgeAuthLocation }).location;
      const hardReloadCurrentDocument = (): void => {
        if (!loc) {
          return;
        }
        const href =
          typeof loc.href === 'string' && loc.href.length > 0
            ? loc.href
            : `${loc.pathname ?? ''}${loc.search ?? ''}${loc.hash ?? ''}` || '/';
        if (typeof loc.replace === 'function') {
          loc.replace(href);
        } else if (typeof loc.reload === 'function') {
          loc.reload();
        }
      };
      if (
        flagKey &&
        loc &&
        (typeof loc.replace === 'function' || typeof loc.reload === 'function')
      ) {
        const slot = consumeBrowserEdgeAuthSsoReloadSlot(flagKey);
        if (slot === 'reload') {
          hardReloadCurrentDocument();
          return new Promise(() => {
            /* never resolves — page is unloading */
          });
        }
      }
    }
    throw createApiError(
      'Admin auth API returned redirect (SSO edge).',
      401,
      adminAuthFetchFailureBody(),
    );
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw createApiError(`API error: ${res.status}`, res.status, body);
  }
  clearEdgeAuthReloadFlags();
  return res.json() as Promise<T>;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const bearer = bearerForRequest(path, method);
  return fetchApiCore<T>(resolveApiUrl(), globalThis.fetch.bind(globalThis), path, {
    ...options,
    headers: {
      ...bearer,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
}

export type FriendListParams = Readonly<{
  offset?: string;
  limit?: string;
  tagId?: string;
  accountId?: string;
}>;

export type FriendWithTags = Friend & { tags: Tag[] };
