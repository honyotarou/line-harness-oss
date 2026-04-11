import { describe, expect, it } from 'vitest';
import {
  isSafeHttpsOutboundUrl,
  unsafeSendWebhookUrlInActions,
} from '../../src/services/outbound-url.js';

describe('isSafeHttpsOutboundUrl', () => {
  it('allows public https URLs', () => {
    expect(isSafeHttpsOutboundUrl('https://example.com/hook')).toBe(true);
    expect(isSafeHttpsOutboundUrl('https://api.stripe.com/v1/events')).toBe(true);
    expect(isSafeHttpsOutboundUrl('https://hooks.slack.com/services/xxx/yyy')).toBe(true);
  });

  it('rejects non-https schemes', () => {
    expect(isSafeHttpsOutboundUrl('http://example.com/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('ftp://example.com/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects loopback and local hostnames', () => {
    expect(isSafeHttpsOutboundUrl('https://localhost/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://127.0.0.1/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://0.0.0.0/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://[::1]/path')).toBe(false);
  });

  it('rejects private and link-local IPv4 ranges', () => {
    expect(isSafeHttpsOutboundUrl('https://10.0.0.1/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://192.168.0.1/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://172.16.0.1/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://172.31.255.1/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://100.64.0.1/')).toBe(false);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(isSafeHttpsOutboundUrl('https://user:pass@example.com/hook')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSafeHttpsOutboundUrl('')).toBe(false);
    expect(isSafeHttpsOutboundUrl('not-a-url')).toBe(false);
    expect(isSafeHttpsOutboundUrl('https://')).toBe(false);
  });
});

describe('unsafeSendWebhookUrlInActions', () => {
  it('returns null when there is no send_webhook action', () => {
    expect(unsafeSendWebhookUrlInActions([{ type: 'add_tag', params: { tagId: 't' } }])).toBeNull();
  });

  it('rejects private URLs in send_webhook', () => {
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'https://127.0.0.1/x' } },
      ]),
    ).toMatch(/not allowed/);
  });

  it('allows safe send_webhook URLs', () => {
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'https://example.com/hook' } },
      ]),
    ).toBeNull();
  });
});
