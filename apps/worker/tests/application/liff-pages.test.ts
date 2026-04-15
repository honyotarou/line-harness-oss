import { describe, expect, it } from 'vitest';
import { authLandingPage, completionPage, errorPage } from '../../src/application/liff-pages.js';

describe('liff pages (Worker HTML)', () => {
  it('injects nonce into inline style/script when provided', () => {
    const nonce = 'test-nonce-123';
    const err = errorPage('x', nonce);
    expect(err).toContain(`<style nonce="${nonce}">`);

    const landing = authLandingPage('https://liff.line.me/abc', 'https://example.com', nonce);
    expect(landing).toContain(`<style nonce="${nonce}">`);
    expect(landing).toContain(`<script nonce="${nonce}">`);

    const done = completionPage('Alice', null, 'ref', nonce);
    expect(done).toContain(`<style nonce="${nonce}">`);
  });
});
