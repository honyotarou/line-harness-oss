'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/layout/header';
import { api } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/field';

type Row = { email: string; role: 'admin' | 'viewer'; updatedAt: string };

export default function AccessRolesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'admin'>('viewer');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminPrincipalRoles.list();
      if (res.success) {
        setRows(res.data);
      } else {
        setError(res.error ?? '一覧の取得に失敗しました');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.adminPrincipalRoles.upsert({ email: email.trim(), role });
      if (!res.success) {
        setError(res.error ?? '保存に失敗しました');
        return;
      }
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(target: string) {
    if (
      !window.confirm(
        `${target} の行を削除しますか？（REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST がオフのときは削除後フル管理者扱いに戻ります。オン時は未登録メールは API 利用不可です）`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.adminPrincipalRoles.remove(target);
      if (!res.success) {
        setError(res.error ?? '削除に失敗しました');
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Header
        title="アクセス権"
        description="Cloudflare Access のメール別ロール（viewer は閲覧のみ）"
      />

      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <section className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">行の追加・更新</h2>
        <p className="text-xs text-gray-600 mb-3">
          既定では行がないメールはフル管理者です。本番の Zero Trust では Worker に{' '}
          <code className="text-[11px]">REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST=1</code>{' '}
          を設定し、ここにメールを登録したユーザーのみ API を許可してください（空テーブル時は
          この画面への PUT のみブートストラップ可能）。閲覧のみは <code>viewer</code> を指定します。
          JWT に <code>email</code> が必要です。
        </p>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1 block text-xs text-gray-600">
            メール
            <Input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="mt-1"
              placeholder="user@example.com"
              required
              disabled={saving}
            />
          </label>
          <label className="block text-xs text-gray-600 w-40 sm:w-48">
            ロール
            <Select
              value={role}
              onChange={(ev) => setRole(ev.target.value as 'viewer' | 'admin')}
              className="mt-1"
              disabled={saving}
            >
              <option value="viewer">viewer（閲覧のみ）</option>
              <option value="admin">admin（明示）</option>
            </Select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            保存
          </button>
        </form>
      </section>

      <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-800">登録一覧</h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50"
          >
            再読み込み
          </button>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-gray-500">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            行がありません（ALLOWLIST オフ時は全員フル管理者扱い）
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 font-medium">メール</th>
                <th className="px-4 py-2 font-medium">ロール</th>
                <th className="px-4 py-2 font-medium">更新</th>
                <th className="px-4 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs">{r.email}</td>
                  <td className="px-4 py-2">
                    {r.role === 'viewer' ? (
                      <Badge className="bg-[var(--color-warning-muted)] text-[var(--color-warning)] border border-[var(--color-warning-border)]">
                        {r.role}
                      </Badge>
                    ) : (
                      <Badge className="bg-[var(--color-primary-muted)] text-[var(--color-primary)]">
                        {r.role}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{r.updatedAt}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => void handleRemove(r.email)}
                      disabled={saving}
                      className="text-xs text-[var(--color-error)] hover:underline disabled:opacity-50"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
