/** Maps thrown values to a user-visible Japanese message (no raw ReferenceError strings). */
export function formatSubmitErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return '送信に失敗しました';
  const m = err.message;
  if (/is not defined/i.test(m) || /^ReferenceError\b/i.test(m)) {
    return '通信先の設定に問題があります。しばらくしてから再度お試しください。';
  }
  if (m === 'Failed to fetch' || /NetworkError|Load failed/i.test(m)) {
    return '通信に失敗しました。ネットワークを確認してください。';
  }
  return m;
}
