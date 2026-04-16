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

function adminAuthApiRedirectMode(path: string, options?: RequestInit): RequestRedirect {
  // Cloudflare Access often answers unauthenticated API calls with 302 to *.cloudflareaccess.com.
  // Default fetch "follow" then hits cross-origin CORS (OPTIONS 403 / no ACAO). Auth paths must not follow.
  if (path.startsWith('/api/auth/')) {
    return 'error';
  }
  return (options?.redirect as RequestRedirect | undefined) ?? 'follow';
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
  const redirect = adminAuthApiRedirectMode(path, options);
  let res: Response;
  try {
    res = await fetchImpl(`${fetchBase}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      redirect,
    });
  } catch (e) {
    if (path.startsWith('/api/auth/')) {
      throw createApiError('Admin auth request failed at redirect (e.g. Cloudflare Access).', 401, {
        error:
          'API が Cloudflare Access のログイン URL へリダイレクトしています。ブラウザの fetch が追従すると別オリジンで CORS になります。admin-access-proxy のサービストークンと line-crm Worker の CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS を確認するか、Cloudflare Access の CORS 設定（公式ドキュメント）を確認してください。',
      });
    }
    throw e;
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
