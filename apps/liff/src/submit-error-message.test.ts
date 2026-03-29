import { describe, expect, it } from 'vitest';
import { formatSubmitErrorMessage } from './submit-error-message.js';

describe('formatSubmitErrorMessage', () => {
  it('returns generic message for non-Error', () => {
    expect(formatSubmitErrorMessage(null)).toBe('送信に失敗しました');
    expect(formatSubmitErrorMessage('x')).toBe('送信に失敗しました');
  });

  it('hides ReferenceError / is not defined from users', () => {
    expect(formatSubmitErrorMessage(new ReferenceError('API_URL is not defined'))).toBe(
      '通信先の設定に問題があります。しばらくしてから再度お試しください。',
    );
    expect(formatSubmitErrorMessage(new Error('x is not defined'))).toBe(
      '通信先の設定に問題があります。しばらくしてから再度お試しください。',
    );
  });

  it('maps common network failures', () => {
    expect(formatSubmitErrorMessage(new Error('Failed to fetch'))).toBe(
      '通信に失敗しました。ネットワークを確認してください。',
    );
    expect(formatSubmitErrorMessage(new Error('NetworkError when attempting to fetch'))).toBe(
      '通信に失敗しました。ネットワークを確認してください。',
    );
    expect(formatSubmitErrorMessage(new Error('Load failed'))).toBe(
      '通信に失敗しました。ネットワークを確認してください。',
    );
  });

  it('passes through other Error messages', () => {
    expect(formatSubmitErrorMessage(new Error('400: bad'))).toBe('400: bad');
  });
});
