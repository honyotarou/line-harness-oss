'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type AutoReplyAdminRow } from '@/lib/api';
import { useAccount } from '@/contexts/account-context';
import Header from '@/components/layout/header';
import { Alert } from '@/components/ui/alert';
import { Input, Select, Textarea } from '@/components/ui/field';

type LineAccountOption = Readonly<{
  id: string;
  name: string;
}>;

export default function AutoRepliesPage() {
  const { selectedAccountId } = useAccount();
  const [rows, setRows] = useState<AutoReplyAdminRow[]>([]);
  const [accounts, setAccounts] = useState<LineAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    keyword: '',
    matchType: 'exact' as 'exact' | 'contains',
    responseType: 'text',
    responseContent: '',
    lineAccountId: '' as string,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.autoReplies.list(selectedAccountId || undefined);
      if (res.success && res.data) {
        setRows(res.data);
      } else {
        setError('自動返信ルールの取得に失敗しました');
      }
    } catch {
      setError('APIに接続できませんでした');
    }
    setLoading(false);
  }, [selectedAccountId]);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await api.lineAccounts.list();
      if (res.success && res.data) {
        setAccounts(
          (res.data as { id: string; name: string }[]).map((a) => ({ id: a.id, name: a.name })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAccounts();
  }, [load, loadAccounts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.keyword.trim() || !form.responseContent.trim()) return;
    await api.autoReplies.create({
      keyword: form.keyword.trim(),
      matchType: form.matchType,
      responseType: form.responseType.trim() || 'text',
      responseContent: form.responseContent.trim(),
      lineAccountId: form.lineAccountId ? form.lineAccountId : null,
    });
    setForm({
      keyword: '',
      matchType: 'exact',
      responseType: 'text',
      responseContent: '',
      lineAccountId: '',
    });
    setShowCreate(false);
    await load();
  };

  const handleToggle = async (r: AutoReplyAdminRow) => {
    await api.autoReplies.update(r.id, { isActive: !r.isActive });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このルールを削除しますか？')) return;
    await api.autoReplies.delete(id);
    await load();
  };

  return (
    <div>
      <Header
        title="自動返信"
        action={
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {showCreate ? '閉じる' : 'ルールを追加'}
          </button>
        }
      />

      <div className="p-6 max-w-5xl">
        {error ? <Alert variant="error">{error}</Alert> : null}

        {showCreate ? (
          <form
            onSubmit={handleCreate}
            className="mb-8 bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-gray-800 mb-4">新規ルール</h2>
            <div className="grid gap-4 max-w-xl">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">キーワード</label>
                <Input
                  value={form.keyword}
                  onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                  placeholder="例: 営業時間"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">マッチ</label>
                <Select
                  value={form.matchType}
                  onChange={(e) =>
                    setForm({ ...form, matchType: e.target.value as 'exact' | 'contains' })
                  }
                >
                  <option value="exact">完全一致</option>
                  <option value="contains">部分一致</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  応答タイプ（LINE message type）
                </label>
                <Input
                  value={form.responseType}
                  onChange={(e) => setForm({ ...form, responseType: e.target.value })}
                  placeholder="text / sticker / flex …"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">応答本文</label>
                <Textarea
                  rows={4}
                  value={form.responseContent}
                  onChange={(e) => setForm({ ...form, responseContent: e.target.value })}
                  placeholder="返信テキスト（テンプレ変数 {{name}} 等は Webhook 側で展開）"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  スコープ（空欄=全アカウント共通）
                </label>
                <Select
                  value={form.lineAccountId}
                  onChange={(e) => setForm({ ...form, lineAccountId: e.target.value })}
                >
                  <option value="">共通ルール</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg w-fit"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                保存
              </button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中…</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-2">キーワード</th>
                  <th className="px-4 py-2">マッチ</th>
                  <th className="px-4 py-2">タイプ</th>
                  <th className="px-4 py-2">有効</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-900">{r.keyword}</td>
                    <td className="px-4 py-2 text-gray-600">{r.matchType}</td>
                    <td className="px-4 py-2 text-gray-600">{r.responseType}</td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => void handleToggle(r)}
                        className="text-xs underline text-[var(--color-primary)]"
                      >
                        {r.isActive ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        className="text-xs text-[var(--color-error)] hover:underline"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                ルールがありません。Webhook は共通／アカウント別ルールを評価します。
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
