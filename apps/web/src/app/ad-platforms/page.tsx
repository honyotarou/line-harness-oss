'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type AdPlatformConnectionApi, type AdPlatformProvider } from '@/lib/api';
import { useAccount } from '@/contexts/account-context';
import Header from '@/components/layout/header';
import { Alert } from '@/components/ui/alert';
import { Input, Select, Textarea } from '@/components/ui/field';

const providers: { id: AdPlatformProvider; label: string }[] = [
  { id: 'meta', label: 'Meta' },
  { id: 'google', label: 'Google' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'x', label: 'X' },
];

export default function AdPlatformsPage() {
  const { selectedAccountId } = useAccount();
  const [rows, setRows] = useState<AdPlatformConnectionApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    provider: 'meta' as AdPlatformProvider,
    name: '',
    externalAccountRef: '',
    credentialsEnc: '',
    metadataJson: '{}',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.adPlatforms.list({ accountId: selectedAccountId || undefined });
      if (!res.success) {
        setError(typeof res.error === 'string' ? res.error : '一覧の取得に失敗しました');
      } else {
        setRows(res.data);
      }
    } catch {
      setError('APIに接続できませんでした');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    let metadata: Record<string, unknown> | undefined;
    try {
      metadata = JSON.parse(form.metadataJson || '{}') as Record<string, unknown>;
    } catch {
      setError('metadata は JSON オブジェクトで入力してください');
      return;
    }
    setError('');
    try {
      const res = await api.adPlatforms.create({
        provider: form.provider,
        name: form.name.trim(),
        lineAccountId: selectedAccountId || null,
        externalAccountRef: form.externalAccountRef.trim() || null,
        credentialsEnc: form.credentialsEnc.trim() || null,
        metadata,
      });
      if (!res.success) {
        setError(typeof res.error === 'string' ? res.error : '作成に失敗しました');
        return;
      }
      setForm({
        provider: 'meta',
        name: '',
        externalAccountRef: '',
        credentialsEnc: '',
        metadataJson: '{}',
      });
      setShowCreate(false);
      void load();
    } catch {
      setError('作成リクエストに失敗しました');
    }
  };

  const handleSync = async (id: string) => {
    setSyncMsg('');
    try {
      const res = await api.adPlatforms.sync(id);
      setSyncMsg(
        res.success
          ? '同期リクエストが完了しました（メタデータに lastOutboundSync* が記録されます）。'
          : typeof res.error === 'string'
            ? res.error
            : '同期に失敗しました',
      );
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'body' in err
          ? JSON.stringify((err as { body?: unknown }).body)
          : '同期リクエストに失敗しました';
      setSyncMsg(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この接続を削除しますか？')) return;
    try {
      await api.adPlatforms.delete(id);
      void load();
    } catch {
      setError('削除に失敗しました');
    }
  };

  return (
    <div>
      <Header
        title="広告プラットフォーム連携"
        action={
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {showCreate ? '閉じる' : '+ 接続を追加'}
          </button>
        }
      />
      <p className="text-sm text-gray-600 mb-4">
        外部広告アカウントの登録とメタデータ管理です。同期は Worker に{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">AD_PLATFORM_OUTBOUND_ENABLED=1</code>{' '}
        が必要で、有効時は各社の HTTPS API に対して資格情報の検証リクエストを送ります（
        <code className="text-xs bg-gray-100 px-1 rounded">credentials_enc</code> は JSON の{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">accessToken</code> など）。無効時は 501。
      </p>
      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {syncMsg ? (
        <Alert variant="info" className="mb-4">
          {syncMsg}
        </Alert>
      ) : null}

      {showCreate ? (
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-white rounded-lg border border-gray-200 p-4 space-y-3 shadow-sm"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-600">プロバイダ</span>
              <Select
                value={form.provider}
                onChange={(e) =>
                  setForm((f) => ({ ...f, provider: e.target.value as AdPlatformProvider }))
                }
                className="mt-1 w-full"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">表示名</span>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="mt-1 w-full"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">外部アカウント参照（任意）</span>
            <Input
              value={form.externalAccountRef}
              onChange={(e) => setForm((f) => ({ ...f, externalAccountRef: e.target.value }))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">
              credentialsEnc（任意・Worker / KMS で暗号化済み文字列を想定）
            </span>
            <Textarea
              value={form.credentialsEnc}
              onChange={(e) => setForm((f) => ({ ...f, credentialsEnc: e.target.value }))}
              rows={2}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">metadata（JSON）</span>
            <Textarea
              value={form.metadataJson}
              onChange={(e) => setForm((f) => ({ ...f, metadataJson: e.target.value }))}
              rows={3}
              className="mt-1 w-full"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            作成
          </button>
        </form>
      ) : null}

      {loading ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">読み込み中…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
          接続がありません。
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  名前
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  プロバイダ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  資格情報
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  状態
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.provider}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.hasCredentials ? 'あり' : 'なし'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.isActive ? 'text-sm text-[var(--color-primary)]' : 'text-gray-500 text-sm'
                      }
                    >
                      {r.isActive ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => void handleSync(r.id)}
                      className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
                    >
                      同期
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(r.id)}
                      className="px-2 py-1 text-xs rounded text-[var(--color-error)] border border-gray-200 hover:bg-[var(--color-error-muted)]"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
