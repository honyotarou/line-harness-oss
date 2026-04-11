'use client';
import { useEffect, useState } from 'react';
import { ApiError, api, setAdminSessionToken, useCloudflareAccessLoginMode } from '@/lib/api';
import { Input } from '@/components/ui/field';

function errorMessageFromApi(err: unknown): string | undefined {
  if (err instanceof ApiError && err.body && typeof err.body === 'object' && err.body !== null) {
    const e = (err.body as { error?: unknown }).error;
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

  useEffect(() => {
    setHydrated(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.auth.login(accessLogin ? undefined : apiKey);
      if (res.success && res.data?.sessionToken) {
        setAdminSessionToken(res.data.sessionToken);
        window.location.assign('/');
      } else if (res.success) {
        window.location.assign('/');
      } else {
        setError(accessLogin ? 'セッションの開始に失敗しました' : 'APIキーが正しくありません');
      }
    } catch (err) {
      const fromBody = errorMessageFromApi(err);
      // Worker returns `{ error: 'Unauthorized' }` for bad API key; keep a friendly JP message for admins.
      const preferJp401 =
        err instanceof ApiError && err.status === 401 && (!fromBody || fromBody === 'Unauthorized');
      if (fromBody && !preferJp401) {
        setError(fromBody);
      } else if (err instanceof ApiError && err.status === 401) {
        setError(
          accessLogin
            ? 'Cloudflare Access のログインが必要です（JWT が Worker に届いているか確認してください）'
            : 'APIキーが正しくありません',
        );
      } else if (err instanceof ApiError && err.status === 400) {
        setError(fromBody ?? 'リクエストが無効です');
      } else {
        setError('接続に失敗しました');
      }
    } finally {
      setLoading(false);
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
                Cloudflare Access で認証したうえで、管理用セッションを発行します。先に Access
                のログインを完了してください。
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

            <button
              type="submit"
              disabled={loading || (!accessLogin && !apiKey)}
              className="w-full py-3 text-white font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
