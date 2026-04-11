import { describe, expect, it } from 'vitest';
import { resolveSafeRedirectUrl } from '../../src/services/liff-redirect.js';

describe('resolveSafeRedirectUrl', () => {
  it('allows HTTPS URLs whose origin is in WEB_URL', () => {
    expect(
      resolveSafeRedirectUrl('https://client.example/path?q=1', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBe('https://client.example/path?q=1');
  });

  it('allows relative paths resolved against WEB_URL', () => {
    expect(
      resolveSafeRedirectUrl('/dashboard', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBe('https://client.example/dashboard');
  });

  it('blocks arbitrary external HTTPS', () => {
    expect(
      resolveSafeRedirectUrl('https://evil.example/phish', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('blocks https URL that uses userinfo to hide a foreign host (origin is attacker host)', () => {
    expect(
      resolveSafeRedirectUrl('https://client.example@evil.example/phish', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('allows line.me', () => {
    expect(
      resolveSafeRedirectUrl('https://line.me/R/ti/p/@x', {
        WEB_URL: 'https://client.example',
      }),
    ).toBe('https://line.me/R/ti/p/@x');
  });
});
