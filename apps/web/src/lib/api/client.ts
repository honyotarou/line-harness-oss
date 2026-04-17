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
  adminAuthFetchFailureBody,
  isBrowserAdminAuthApiPath,
  resolveBrowserFetchRedirectPolicy,
  shouldTreatBrowserAuthResponseAsSsoRedirect,
} from './admin-auth-fetch-policy.js';

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

export type ApiErrorLike = Error & { readonly status: number; readonly body?: unknown };
export function createApiError(message: string, status: number, body?: unknown): ApiErrorLike {
  return new ApiError(message, status, body);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function apiBaseUrlValidationOptions(): { allowPlaceholderTemplate?: boolean } {
  return { allowPlaceholderTemplate: allowAdminApiUrlPlaceholderTemplate() };
}

/** Separate gates: POST login reload must not consume the session GET gate (otherwise 2nd click throws immediately). */
const EDGE_AUTH_RELOAD_SESSION = 'lh_edge_auth_sso_reload_session';
const EDGE_AUTH_RELOAD_LOGIN = 'lh_edge_auth_sso_reload_login';

function edgeAuthReloadFlagKey(path: string, method: string): string | null {
  if (path === '/api/auth/session' && method === 'GET') return EDGE_AUTH_RELOAD_SESSION;
  if (path === '/api/auth/login' && method === 'POST') return EDGE_AUTH_RELOAD_LOGIN;
  return null;
}

function clearEdgeAuthReloadFlags(): void {
  try {
    if (typeof globalThis !== 'undefined' && 'sessionStorage' in globalThis) {
      globalThis.sessionStorage.removeItem(EDGE_AUTH_RELOAD_SESSION);
      globalThis.sessionStorage.removeItem(EDGE_AUTH_RELOAD_LOGIN);
    }
  } catch {
    /* private mode / denied */
  }
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
  if (isBrowserAdminAuthApiPath(path) && shouldTreatBrowserAuthResponseAsSsoRedirect(res)) {
    const flagKey = edgeAuthReloadFlagKey(path, method);
    if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
      const loc = (globalThis as { location?: { reload?: () => void } }).location;
      if (flagKey && loc && typeof loc.reload === 'function') {
        try {
          if (
            'sessionStorage' in globalThis &&
            globalThis.sessionStorage.getItem(flagKey) === '1'
          ) {
            globalThis.sessionStorage.removeItem(flagKey);
          } else if ('sessionStorage' in globalThis) {
            globalThis.sessionStorage.setItem(flagKey, '1');
            loc.reload();
            return new Promise(() => {
              /* never resolves — page is unloading */
            });
          }
        } catch {
          /* sessionStorage unavailable — fall through to throw */
        }
        if ('sessionStorage' in globalThis) {
          try {
            globalThis.sessionStorage.removeItem(flagKey);
          } catch {
            /* ignore */
          }
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

export type FriendListParams = {
  offset?: string;
  limit?: string;
  tagId?: string;
  accountId?: string;
};

export type FriendWithTags = Friend & { tags: Tag[] };
