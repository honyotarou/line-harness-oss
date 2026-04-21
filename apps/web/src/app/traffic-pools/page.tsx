'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type PoolAccountAdminRow, type TrafficPoolAdminRow } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api/client';
import Header from '@/components/layout/header';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/field';
type LineAccountOption = Readonly<{
  id: string;
  name: string;
  channelId: string;
}>;

export default function TrafficPoolsPage() {
  const [pools, setPools] = useState<TrafficPoolAdminRow[]>([]);
  const [accounts, setAccounts] = useState<LineAccountOption[]>([]);
  const [poolAccountsByPool, setPoolAccountsByPool] = useState<
    Record<string, PoolAccountAdminRow[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '', activeAccountId: '' });
  const [addLineByPool, setAddLineByPool] = useState<Record<string, string>>({});

  const workerOrigin = getApiBaseUrl().replace(/\/+$/, '');

  const loadPools = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.trafficPools.list();
      if (res.success && res.data) {
        setPools(res.data);
      } else {
        setError('トラフィックプール一覧の取得に失敗しました');
      }
    } catch {
      setError('APIに接続できませんでした');
    }
    setLoading(false);
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await api.lineAccounts.list();
      if (res.success && res.data) {
        setAccounts(
          (res.data as { id: string; name: string; channelId: string }[]).map((a) => ({
            id: a.id,
            name: a.name,
            channelId: a.channelId,
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPools();
    void loadAccounts();
  }, [loadPools, loadAccounts]);

  const loadPoolAccounts = async (poolId: string) => {
    const res = await api.trafficPools.listAccounts(poolId);
    if (res.success && res.data) {
      setPoolAccountsByPool((prev) => ({ ...prev, [poolId]: res.data as PoolAccountAdminRow[] }));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.slug.trim() || !form.name.trim() || !form.activeAccountId) return;
    try {
      await api.trafficPools.create({
        slug: form.slug.trim(),
        name: form.name.trim(),
        activeAccountId: form.activeAccountId,
      });
      setForm({ slug: '', name: '', activeAccountId: '' });
      setShowCreate(false);
      await loadPools();
    } catch {
      setError('作成に失敗しました（slug の重複など）');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このプールを削除しますか？')) return;
    await api.trafficPools.delete(id);
    await loadPools();
  };

  const handleTogglePool = async (p: TrafficPoolAdminRow) => {
    await api.trafficPools.update(p.id, { isActive: !p.isActive });
    await loadPools();
  };

  const handleAddPoolAccount = async (poolId: string) => {
    const lineAccountId = (addLineByPool[poolId] ?? '').trim();
    if (!lineAccountId) return;
    await api.trafficPools.addAccount(poolId, lineAccountId);
    setAddLineByPool((prev) => ({ ...prev, [poolId]: '' }));
    await loadPoolAccounts(poolId);
  };

  const handleTogglePoolAccount = async (
    poolId: string,
    rowId: string,
    currentlyActive: boolean,
  ) => {
    await api.trafficPools.setAccountActive(poolId, rowId, !currentlyActive);
    await loadPoolAccounts(poolId);
  };

  const handleRemovePoolAccount = async (poolId: string, rowId: string) => {
    if (!confirm('このアカウントをプールから外しますか？')) return;
    await api.trafficPools.removeAccount(poolId, rowId);
    await loadPoolAccounts(poolId);
  };

  return (
    <div>
      <Header
        title="トラフィックプール"
        description="配信用のエントリ URL（/pool/:slug）で LIFF ログイン先アカウントを振り分け"
        action={
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {showCreate ? 'キャンセル' : '+ プール作成'}
          </button>
        }
      />

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      <p className="text-sm text-gray-600 mb-4">
        公開エントリは Worker 上の{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">{workerOrigin}/pool/&lt;slug&gt;</code>{' '}
        です。LINE 広告などにはこの URL を貼り付け、管理画面ではプールに紐づく LINE
        アカウントを管理します。
      </p>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-lg border border-gray-200 p-6 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">slug（URL 用）</label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="spring-campaign"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="春キャンペーン"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                既定 LINE アカウント
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.activeAccountId}
                onChange={(e) => setForm({ ...form, activeAccountId: e.target.value })}
                required
              >
                <option value="">選択してください</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.channelId})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            作成
          </button>
        </form>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          読み込み中...
        </div>
      ) : pools.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          トラフィックプールがありません
        </div>
      ) : (
        <div className="space-y-4">
          {pools.map((p) => {
            const entryUrl = `${workerOrigin}/pool/${encodeURIComponent(p.slug)}`;
            const rows = poolAccountsByPool[p.id];
            return (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      slug: <code>{p.slug}</code> · 既定: {p.accountName}
                    </p>
                    <p className="text-xs text-gray-600 mt-2 break-all">
                      <span className="font-medium">エントリ:</span>{' '}
                      <a
                        href={entryUrl}
                        className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {entryUrl}
                      </a>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePool(p)}
                      className="px-3 py-1.5 rounded border text-sm"
                    >
                      {p.isActive ? '無効化' : '有効化'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadPoolAccounts(p.id)}
                      className="px-3 py-1.5 rounded border text-sm"
                    >
                      アカウント一覧更新
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(p.id)}
                      className="px-3 py-1.5 rounded border border-[var(--color-error-muted)] text-sm text-[var(--color-error)]"
                    >
                      削除
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">プール内アカウント</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <select
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm flex-1 min-w-[200px]"
                      value={addLineByPool[p.id] ?? ''}
                      onChange={(e) =>
                        setAddLineByPool((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    >
                      <option value="">追加する LINE アカウント</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded text-white text-sm"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                      onClick={() => void handleAddPoolAccount(p.id)}
                    >
                      追加
                    </button>
                  </div>
                  {rows && rows.length > 0 ? (
                    <ul className="text-sm space-y-1">
                      {rows.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-0"
                        >
                          <span>
                            {r.accountName}{' '}
                            <span className="text-gray-400">({r.isActive ? '有効' : '無効'})</span>
                          </span>
                          <span className="flex gap-2">
                            <button
                              type="button"
                              className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                              onClick={() => void handleTogglePoolAccount(p.id, r.id, r.isActive)}
                            >
                              切替
                            </button>
                            <button
                              type="button"
                              className="text-xs text-[var(--color-error)]"
                              onClick={() => void handleRemovePoolAccount(p.id, r.id)}
                            >
                              削除
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">
                      「アカウント一覧更新」で読み込みます（未読込時は空表示）。
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
