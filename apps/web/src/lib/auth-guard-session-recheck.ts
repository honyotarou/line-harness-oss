/**
 * When false, AuthGuard keeps the shell mounted while re-checking the session so in-flight
 * `fetch(..., { credentials: 'include' })` calls are not aborted (avoids DevTools "canceled" storms).
 */
export function shouldAuthGuardBlockUiForSessionRecheck(params: {
  pathname: string;
  previousPathname: string | null;
}): boolean {
  const { pathname, previousPathname } = params;
  if (pathname === '/login') {
    return false;
  }
  return previousPathname === null || previousPathname === '/login';
}
