/**
 * When false, AuthGuard keeps the shell mounted while re-checking the session so in-flight
 * `fetch(..., { credentials: 'include' })` calls are not aborted (avoids DevTools "canceled" storms).
 */
export function shouldAuthGuardBlockUiForSessionRecheck(params: {
  /** `usePathname()` may be `null` before the router is ready (Next.js 15 types). */
  pathname: string | null;
  previousPathname: string | null;
}): boolean {
  const { pathname, previousPathname } = params;
  if (pathname === '/login') {
    return false;
  }
  return previousPathname === null || previousPathname === '/login';
}
