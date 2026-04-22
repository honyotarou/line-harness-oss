'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  isAdminAccessLoginCompletePath,
  stripAdminAccessLoginCompleteMarker,
} from '@line-crm/shared';
import { api, isApiError, setAdminSessionToken, useCloudflareAccessLoginMode } from '@/lib/api';
import { SpringFieldBackdrop } from '@/components/layout/spring-field-backdrop';
import { RaCheckLogo } from '@/components/racheck-logo';
import { Input } from '@/components/ui/field';
import { buildAdminAccessBootstrapStartHref } from '@/lib/admin-access-bootstrap-start';

function errorMessageFromApi(err: unknown): string | undefined {
  if (isApiError(err)) {
    const body = err.body;
    if (!body || typeof body !== 'object') return undefined;
    const e = (body as { error?: unknown }).error;
    return typeof e === 'string' && e.trim() ? e : undefined;
  }
  return undefined;
}

function LoginLogoMark() {
  return (
    <div className="mb-6 text-center">
      <RaCheckLogo variant="login" />
      <p className="mt-3 text-xs font-medium text-[var(--color-foreground)] drop-shadow-[0_1px_0_rgb(255_255_255/0.9)]">
        LINE Harness OSS · 管理コンソール
      </p>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SpringFieldBackdrop variant="fixed" position="center 40%" />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10">
        <LoginLogoMark />
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white/92 p-8 shadow-[var(--shadow-token-lg)] backdrop-blur-md">
          <div className="text-center mb-4">
            <h1 className="text-lg font-bold text-gray-900">ログイン</h1>
            <p className="text-sm text-gray-500 mt-1">セッションを確認しています</p>
          </div>
          <div className="py-10 flex justify-center">
            <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-[var(--color-marketing-orange)] rounded-full" />
          </div>
        </div>
      </div>
      <footer className="relative z-10 mt-auto shrink-0 border-t border-[var(--color-border-strong)]/70 bg-[var(--color-surface)]/85 py-3 text-center text-xs text-[var(--color-foreground-muted)] backdrop-blur-md sm:text-sm">
        LINE Harness OSS — 管理コンソール
      </footer>
    </div>
  );
}

function LoginPageInner() {
  const accessLogin = useCloudflareAccessLoginMode();
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessLoginAttemptedRef = useRef(false);
  const accessStartHref = buildAdminAccessBootstrapStartHref();

  useEffect(() => {
    setHydrated(true);
  }, []);

  const runLoginFlow = async (params: { accessLogin: boolean; apiKey?: string }) => {
    setLoading(true);
    setError('');

    let skipLoadingReset = false;
    try {
      const res = await api.auth.login(params.accessLogin ? undefined : params.apiKey);
      if (!res.success || !res.data?.expiresAt) {
        setError(
          params.accessLogin ? 'セッションの開始に失敗しました' : 'APIキーが正しくありません',
        );
        return;
      }
      if (res.data.sessionToken) {
        setAdminSessionToken(res.data.sessionToken);
      }
      let sess: Awaited<ReturnType<typeof api.auth.session>>;
      try {
        sess = await api.auth.session();
      } catch (sessionErr) {
        if (isApiError(sessionErr) && sessionErr.status === 401) {
          const msg = errorMessageFromApi(sessionErr);
          if (msg && msg !== 'Unauthorized') {
            setError(msg);
          } else {
            setError(
              'ログインは成功しましたが、管理セッションを確認できませんでした。`lh_admin_session` がブラウザに保存されていない可能性があります。`admin-access-proxy-worker` を最新版で再デプロイするか、API Worker に INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY=1 を設定してください。',
            );
          }
          return;
        }
        throw sessionErr;
      }
      if (sess.success && sess.data?.authenticated) {
        skipLoadingReset = true;
        window.location.replace('/');
        return;
      }
      setError(
        'セッションを開始できませんでした。クロスオリジンでは Worker に INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY=1 を設定するか、同一サイトで Cookie を使える構成にしてください。',
      );
    } catch (err) {
      const fromBody = errorMessageFromApi(err);
      // Worker returns `{ error: 'Unauthorized' }` for bad API key; keep a friendly JP message for admins.
      const apiErr = isApiError(err) ? err : null;
      const preferJp401 =
        apiErr !== null && apiErr.status === 401 && (!fromBody || fromBody === 'Unauthorized');
      if (fromBody && !preferJp401) {
        setError(fromBody);
      } else if (apiErr !== null && apiErr.status === 401) {
        setError(
          params.accessLogin
            ? 'Cloudflare Access のログインが必要です（JWT が Worker に届いているか確認してください）'
            : 'APIキーが正しくありません',
        );
      } else if (apiErr !== null && apiErr.status === 400) {
        setError(fromBody ?? 'リクエストが無効です');
      } else if (apiErr !== null && apiErr.status === 429) {
        setError(
          fromBody ??
            '短時間にリクエストが多すぎます。しばらく待ってから再度お試しください（レート制限）。',
        );
      } else {
        setError('接続に失敗しました');
      }
    } finally {
      if (!skipLoadingReset) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!hydrated || !accessLogin || pathname !== '/login') {
      return;
    }
    const search = searchParams?.toString() ?? '';
    const currentLoginPath = search ? `${pathname}?${search}` : pathname;
    if (!isAdminAccessLoginCompletePath(currentLoginPath)) {
      return;
    }
    if (accessLoginAttemptedRef.current) {
      return;
    }
    accessLoginAttemptedRef.current = true;
    const cleaned = stripAdminAccessLoginCompleteMarker(currentLoginPath);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', cleaned);
    }
    void runLoginFlow({ accessLogin: true });
  }, [accessLogin, hydrated, pathname, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accessLogin) {
      // Access ログインは fetch では完走できないので、トップレベル遷移させる。
      window.location.assign(accessStartHref);
      return;
    }
    await runLoginFlow({ accessLogin: false, apiKey });
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <SpringFieldBackdrop variant="fixed" position="center 40%" />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10">
        <LoginLogoMark />
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white/92 p-8 shadow-[var(--shadow-token-lg)] backdrop-blur-md">
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold text-gray-900">ログイン</h1>
            <p className="text-sm text-gray-500 mt-1">API キーまたは Cloudflare Access</p>
          </div>

          {!hydrated ? (
            <div className="py-10 flex justify-center">
              <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-[var(--color-marketing-orange)] rounded-full" />
            </div>
          ) : (
            <form onSubmit={handleLogin}>
              {accessLogin ? (
                <p className="text-sm text-gray-600 mb-4">
                  Cloudflare Access のログインを開始します。IdP（Google
                  など）での認証後、このページに戻ります。
                </p>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="APIキーを入力"
                    className="px-4 py-3 focus:border-transparent"
                    autoFocus
                  />
                </div>
              )}

              {error && <p className="text-sm text-[var(--color-error)] mb-4">{error}</p>}

              {accessLogin ? (
                <a
                  href={accessStartHref}
                  className="block w-full py-3 text-white text-center font-medium rounded-lg transition-colors bg-[var(--color-marketing-orange)] hover:bg-[var(--color-marketing-orange-deep)]"
                >
                  Access ログインへ
                </a>
              ) : (
                <button
                  type="submit"
                  disabled={loading || (!accessLogin && !apiKey)}
                  className="w-full py-3 text-white font-medium rounded-lg transition-colors bg-[var(--color-marketing-orange)] hover:bg-[var(--color-marketing-orange-deep)] disabled:opacity-50"
                >
                  {loading ? 'ログイン中...' : 'ログイン'}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
      <footer className="relative z-10 mt-auto shrink-0 border-t border-[var(--color-border-strong)]/70 bg-[var(--color-surface)]/85 py-3 text-center text-xs text-[var(--color-foreground-muted)] backdrop-blur-md sm:text-sm">
        LINE Harness OSS — 管理コンソール
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}
