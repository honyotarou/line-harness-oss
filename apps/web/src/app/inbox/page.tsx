'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type InboxThreadApi } from '@/lib/api';
import { useAccount } from '@/contexts/account-context';
import Header from '@/components/layout/header';
import { Alert } from '@/components/ui/alert';
import SafeLink from '@/components/safe-link';

function formatWhen(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InboxPage() {
  const { selectedAccountId } = useAccount();
  const [rows, setRows] = useState<InboxThreadApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.inbox.threads.list({
        accountId: selectedAccountId || undefined,
        limit: '100',
        offset: '0',
      });
      if (!res.success) {
        setError(typeof res.error === 'string' ? res.error : 'スレッドの取得に失敗しました');
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

  return (
    <div>
      <Header title="受信箱（Inbox）" />
      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <p className="text-sm text-gray-600 mb-4">
        メッセージログがある友だちを新しい順に表示します。個別のやり取りは{' '}
        <SafeLink href="/chats" className="text-[var(--color-primary)] underline">
          個別チャット
        </SafeLink>{' '}
        から開けます。
      </p>
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          読み込み中…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
          表示するスレッドがありません。
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    友だち
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    最終メッセージ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    最終日時
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    向き
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    受信件数
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.friendId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{r.friendName}</p>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{r.friendId}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-md truncate">
                      {r.lastContent ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatWhen(r.lastAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.lastDirection ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {r.incomingTotal.toLocaleString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SafeLink
                        href="/chats"
                        className="text-sm text-[var(--color-primary)] hover:underline"
                      >
                        個別チャット
                      </SafeLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
