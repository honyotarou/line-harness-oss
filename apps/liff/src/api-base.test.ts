import { describe, expect, it } from 'vitest';
import { DEFAULT_LIFF_API_DEV, resolveLiffApiBaseUrl } from './api-base.js';

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
    expect(resolveLiffApiBaseUrl('', 'http://localhost:8787')).toBe('http://localhost:8787');
  });

  it('strips trailing slash from origin', () => {
    expect(resolveLiffApiBaseUrl(undefined, 'https://worker.dev/')).toBe('https://worker.dev');
  });

  it(`falls back to ${DEFAULT_LIFF_API_DEV} when env empty and origin missing or invalid`, () => {
    expect(resolveLiffApiBaseUrl(undefined, null)).toBe(DEFAULT_LIFF_API_DEV);
    expect(resolveLiffApiBaseUrl(undefined, '')).toBe(DEFAULT_LIFF_API_DEV);
    expect(resolveLiffApiBaseUrl(undefined, 'not-a-url')).toBe(DEFAULT_LIFF_API_DEV);
    expect(resolveLiffApiBaseUrl('   ', undefined)).toBe(DEFAULT_LIFF_API_DEV);
  });
});
