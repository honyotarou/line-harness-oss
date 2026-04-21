export const ADMIN_ACCESS_LOGIN_COMPLETE_PATHNAME = '/login';
export const ADMIN_ACCESS_LOGIN_COMPLETE_PARAM = 'access';
export const ADMIN_ACCESS_LOGIN_COMPLETE_VALUE = 'complete';

const ADMIN_ACCESS_LOGIN_COMPLETE_BASE_URL = 'https://admin.invalid';

function parseAdminAccessLoginCompleteUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw, ADMIN_ACCESS_LOGIN_COMPLETE_BASE_URL);
  } catch {
    return null;
  }
}

function serializePathAndQuery(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildAdminAccessLoginCompleteReturnTo(
  loginPath: string = ADMIN_ACCESS_LOGIN_COMPLETE_PATHNAME,
): string {
  const url =
    parseAdminAccessLoginCompleteUrl(loginPath) ??
    new URL(ADMIN_ACCESS_LOGIN_COMPLETE_PATHNAME, ADMIN_ACCESS_LOGIN_COMPLETE_BASE_URL);
  url.searchParams.set(ADMIN_ACCESS_LOGIN_COMPLETE_PARAM, ADMIN_ACCESS_LOGIN_COMPLETE_VALUE);
  return serializePathAndQuery(url);
}

export function isAdminAccessLoginCompletePath(pathOrUrl: string): boolean {
  const url = parseAdminAccessLoginCompleteUrl(pathOrUrl);
  if (!url) {
    return false;
  }
  return (
    url.pathname === ADMIN_ACCESS_LOGIN_COMPLETE_PATHNAME &&
    url.searchParams.get(ADMIN_ACCESS_LOGIN_COMPLETE_PARAM) === ADMIN_ACCESS_LOGIN_COMPLETE_VALUE
  );
}

export function normalizeAdminAccessLoginCompletePath(pathOrUrl: string): string | null {
  const url = parseAdminAccessLoginCompleteUrl(pathOrUrl);
  if (!url || !isAdminAccessLoginCompletePath(pathOrUrl)) {
    return null;
  }
  return serializePathAndQuery(url);
}

export function stripAdminAccessLoginCompleteMarker(pathOrUrl: string): string {
  const url =
    parseAdminAccessLoginCompleteUrl(pathOrUrl) ??
    new URL(ADMIN_ACCESS_LOGIN_COMPLETE_PATHNAME, ADMIN_ACCESS_LOGIN_COMPLETE_BASE_URL);
  url.searchParams.delete(ADMIN_ACCESS_LOGIN_COMPLETE_PARAM);
  return serializePathAndQuery(url);
}
