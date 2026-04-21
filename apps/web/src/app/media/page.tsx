'use client';

import { useState } from 'react';
import { api, getApiBaseUrl } from '@/lib/api';
import { useAccount } from '@/contexts/account-context';
import Header from '@/components/layout/header';
import { Alert } from '@/components/ui/alert';

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string' || !r.startsWith('data:')) {
        reject(new Error('read_failed'));
        return;
      }
      const comma = r.indexOf(',');
      const header = r.slice(5, comma);
      const mimeMatch = /^([^;]+)/.exec(header);
      const mimeType = mimeMatch?.[1]?.trim() || 'application/octet-stream';
      const base64 = r.slice(comma + 1);
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export default function MediaPage() {
  const { selectedAccountId } = useAccount();
  const [error, setError] = useState('');
  const [okPath, setOkPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setOkPath(null);
    setBusy(true);
    try {
      const { base64, mimeType } = await readFileAsBase64(file);
      const res = await api.images.upload({
        mimeType,
        base64,
        lineAccountId: selectedAccountId || null,
      });
      if (!res.success || !res.data) {
        setError(typeof res.error === 'string' ? res.error : 'アップロードに失敗しました');
        return;
      }
      setOkPath(res.data.publicUrlPath);
    } catch {
      setError('アップロードに失敗しました（R2 未設定の Worker では 503 になります）');
    } finally {
      setBusy(false);
    }
  };

  const publicUrl =
    okPath &&
    `${getApiBaseUrl().replace(/\/+$/, '')}${okPath.startsWith('/') ? okPath : `/${okPath}`}`;

  return (
    <div>
      <Header title="画像ライブラリ" />
      <p className="text-sm text-gray-600 mb-4">
        JPEG / PNG / GIF / WebP をアップロードし、LINE メッセージ用の公開 URL
        パスを取得します。Worker に{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">LINE_CRM_IMAGES</code> R2
        バインディングが必要です。
      </p>
      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {publicUrl ? (
        <Alert className="mb-4">
          <p className="text-sm break-all">公開 URL: {publicUrl}</p>
        </Alert>
      ) : null}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">
          画像ファイル
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            disabled={busy}
            onChange={(ev) => void onFile(ev)}
            className="mt-2 block w-full text-sm text-gray-600"
          />
        </label>
        {busy ? <p className="mt-3 text-sm text-gray-500">処理中…</p> : null}
      </div>
    </div>
  );
}
