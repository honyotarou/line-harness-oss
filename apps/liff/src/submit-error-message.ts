/**
 * Maps thrown values to a user-visible Japanese message (no raw ReferenceError / engine strings).
 * Use `fallbackWhenNotError` for the non-Error branch so each screen keeps its own wording.
 */
export function formatLiffUserVisibleError(err: unknown, fallbackWhenNotError: string): string {
  if (!(err instanceof Error)) return fallbackWhenNotError;
  const m = err.message;
  if (/\bAPI_URL\b/i.test(m) && (/is not defined/i.test(m) || /not defined/i.test(m))) {
    return '通信先の設定に問題があります。ビルド時の VITE_API_URL（Workers の URL）を確認してください。';
  }
  if (/is not defined/i.test(m) || /^ReferenceError\b/i.test(m)) {
    return '通信先の設定に問題があります。しばらくしてから再度お試しください。';
  }
  if (m === 'Failed to fetch' || /NetworkError|Load failed/i.test(m)) {
    return '通信に失敗しました。ネットワークを確認してください。';
  }
  return m;
}

export function formatSubmitErrorMessage(err: unknown): string {
  return formatLiffUserVisibleError(err, '送信に失敗しました');
}
