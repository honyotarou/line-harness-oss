'use client';
import { useEffect, useState } from 'react';
import { ApiError, api, setAdminSessionToken, useCloudflareAccessLoginMode } from '@/lib/api';
import { Input } from '@/components/ui/field';
import { buildAdminAccessSessionStartHref } from '@/lib/admin-access-session-start';

function errorMessageFromApi(err: unknown): string | undefined {
  if (err instanceof Error && err.name === 'ApiError' && 'body' in err) {
    const body = (err as { body?: unknown }).body;
    if (!body || typeof body !== 'object') return undefined;
    const e = (body as { error?: unknown }).error;
    return typeof e === 'string' && e.trim() ? e : undefined;
  }
  return undefined;
}

export default function LoginPage() {
  const accessLogin = useCloudflareAccessLoginMode();
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const accessStartHref = buildAdminAccessSessionStartHref({ returnTo: '/login' });

  useEffect(() => {
    setHydrated(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accessLogin) {
      // Access ログインは fetch では完走できないので、トップレベル遷移させる。
      window.location.assign(accessStartHref);
      return;
    }
    setLoading(true);
    setError('');

    let skipLoadingReset = false;
    try {
      const res = await api.auth.login(accessLogin ? undefined : apiKey);
      if (!res.success || !res.data?.expiresAt) {
        setError(accessLogin ? 'セッションの開始に失敗しました' : 'APIキーが正しくありません');
        return;
      }
      if (res.data.sessionToken) {
        setAdminSessionToken(res.data.sessionToken);
      }
      let sess: Awaited<ReturnType<typeof api.auth.session>>;
      try {
        sess = await api.auth.session();
      } catch (sessionErr) {
        if (sessionErr instanceof ApiError && sessionErr.status === 401) {
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
      const preferJp401 =
        err instanceof Error &&
        err.name === 'ApiError' &&
        'status' in err &&
        (err as { status?: unknown }).status === 401 &&
        (!fromBody || fromBody === 'Unauthorized');
      if (fromBody && !preferJp401) {
        setError(fromBody);
      } else if (
        err instanceof Error &&
        err.name === 'ApiError' &&
        'status' in err &&
        (err as { status?: unknown }).status === 401
      ) {
        setError(
          accessLogin
            ? 'Cloudflare Access のログインが必要です（JWT が Worker に届いているか確認してください）'
            : 'APIキーが正しくありません',
        );
      } else if (
        err instanceof Error &&
        err.name === 'ApiError' &&
        'status' in err &&
        (err as { status?: unknown }).status === 400
      ) {
        setError(fromBody ?? 'リクエストが無効です');
      } else if (
        err instanceof Error &&
        err.name === 'ApiError' &&
        'status' in err &&
        (err as { status?: unknown }).status === 429
      ) {
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

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-primary)' }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-3"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            H
          </div>
          <h1 className="text-xl font-bold text-gray-900">LINE Harness</h1>
          <p className="text-sm text-gray-500 mt-1">管理画面にログイン</p>
        </div>

        {!hydrated ? (
          <div className="py-10 flex justify-center">
            <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
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
                className="block w-full py-3 text-white text-center font-medium rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Access ログインへ
              </a>
            ) : (
              <button
                type="submit"
                disabled={loading || (!accessLogin && !apiKey)}
                className="w-full py-3 text-white font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
