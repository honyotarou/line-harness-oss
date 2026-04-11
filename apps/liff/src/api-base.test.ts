import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIFF_API_FALLBACK,
  isLineHostedLiffPageOrigin,
  resolveLiffApiBaseUrl,
} from './api-base.js';

describe('isLineHostedLiffPageOrigin', () => {
  it('detects LINE LIFF page hosts', () => {
    expect(isLineHostedLiffPageOrigin('https://liff.line.me')).toBe(true);
    expect(isLineHostedLiffPageOrigin('https://access.line.me/foo')).toBe(true);
    expect(isLineHostedLiffPageOrigin('https://line-crm-worker.example.workers.dev')).toBe(false);
  });
});

describe('resolveLiffApiBaseUrl', () => {
  it('prefers non-empty trimmed VITE value over browser origin', () => {
    expect(resolveLiffApiBaseUrl(' https://api.example ', 'https://page.example')).toBe(
      'https://api.example',
    );
  });

  it('strips trailing slashes from env URL', () => {
    expect(resolveLiffApiBaseUrl('https://api.example///', null)).toBe('https://api.example');
  });

  it('uses browser origin when env is empty', () => {
    expect(resolveLiffApiBaseUrl(undefined, 'https://line-crm-worker.example.workers.dev')).toBe(
      'https://line-crm-worker.example.workers.dev',
    );
    expect(resolveLiffApiBaseUrl('', 'https://worker.example.workers.dev')).toBe(
      'https://worker.example.workers.dev',
    );
  });

  it('strips trailing slash from origin', () => {
    expect(resolveLiffApiBaseUrl(undefined, 'https://worker.dev/')).toBe('https://worker.dev');
  });

  it(`falls back to ${DEFAULT_LIFF_API_FALLBACK} when env empty and origin missing or invalid`, () => {
    expect(resolveLiffApiBaseUrl(undefined, null)).toBe(DEFAULT_LIFF_API_FALLBACK);
    expect(resolveLiffApiBaseUrl(undefined, '')).toBe(DEFAULT_LIFF_API_FALLBACK);
    expect(resolveLiffApiBaseUrl(undefined, 'not-a-url')).toBe(DEFAULT_LIFF_API_FALLBACK);
    expect(resolveLiffApiBaseUrl('   ', undefined)).toBe(DEFAULT_LIFF_API_FALLBACK);
  });

  it('rejects non-local http and unsafe https in dev by falling back to the default', () => {
    expect(resolveLiffApiBaseUrl('http://evil.example', null)).toBe(DEFAULT_LIFF_API_FALLBACK);
    expect(resolveLiffApiBaseUrl('https://user:pass@x.com', null)).toBe(DEFAULT_LIFF_API_FALLBACK);
  });

  it('does not use liff.line.me as API base (no /api on LINE host)', () => {
    expect(resolveLiffApiBaseUrl(undefined, 'https://liff.line.me')).toBe(
      DEFAULT_LIFF_API_FALLBACK,
    );
  });

  it('uses meta lh-api-base when page is on LINE LIFF host', () => {
    expect(
      resolveLiffApiBaseUrl(
        undefined,
        'https://liff.line.me',
        'https://worker.example.workers.dev',
      ),
    ).toBe('https://worker.example.workers.dev');
  });

  it('prefers env over meta', () => {
    expect(
      resolveLiffApiBaseUrl(
        'https://api.example',
        'https://liff.line.me',
        'https://ignored.workers.dev',
      ),
    ).toBe('https://api.example');
  });
});
