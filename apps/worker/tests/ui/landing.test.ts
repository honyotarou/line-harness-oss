import { describe, expect, it } from 'vitest';
import { renderAuthQrPage, renderShortLinkLanding } from '../../src/ui/landing.js';

describe('renderShortLinkLanding', () => {
  const poisonTarget = 'https://liff.line.me/app" onmouseover="alert(1)';

  it('HTML-escapes the CTA href in the default variant (attribute breakout)', () => {
    const html = renderShortLinkLanding({}, poisonTarget);
    expect(html).toContain('href="https://liff.line.me/app&quot; onmouseover=&quot;alert(1)"');
    expect(html).not.toContain('href="https://liff.line.me/app" onmouseover=');
  });

  it('HTML-escapes the CTA href in the custom variant', () => {
    const html = renderShortLinkLanding({ LANDING_VARIANT: 'custom' }, poisonTarget);
    expect(html).toContain('href="https://liff.line.me/app&quot; onmouseover=&quot;alert(1)"');
    expect(html).not.toContain('href="https://liff.line.me/app" onmouseover=');
  });

  it('embeds QR as SVG data URL (no third-party QR API)', () => {
    const html = renderAuthQrPage({}, 'https://liff.line.me/x?ref=1');
    expect(html).toContain('data:image/svg+xml');
    expect(html).not.toContain('api.qrserver.com');
  });
});
