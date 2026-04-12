import { describe, expect, it } from 'vitest';
import { qrPayloadToSvgDataUrl } from '../../src/services/qr-svg-data-url.js';

describe('qrPayloadToSvgDataUrl', () => {
  it('returns a data URL with embedded SVG (no external QR host)', () => {
    const url = qrPayloadToSvgDataUrl('https://liff.line.me/test');
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
    expect(url).toContain(encodeURIComponent('<svg'));
    expect(url).not.toContain('qrserver.com');
  });
});
