import { describe, expect, it } from 'vitest';
import { renderAuthQrPage, renderShortLinkLanding } from '../../src/ui/landing.js';

const poisonTarget = 'https://liff.line.me/app" onmouseover="alert(1)';

describe('renderShortLinkLanding', () => {
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

  it('custom variant: LANDING_NOTE_HTML cannot inject script (br-only fragment)', () => {
    const html = renderShortLinkLanding(
      {
        LANDING_VARIANT: 'custom',
        LANDING_NOTE_HTML: '<script>alert(1)</script>説明<br>次行',
      },
      'https://example.com/liff',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('説明<br>次行');
  });
});

describe('renderAuthQrPage', () => {
  it('embeds QR as SVG data URL (no third-party QR API)', () => {
    const html = renderAuthQrPage({}, 'https://liff.line.me/x?ref=1');
    expect(html).toContain('data:image/svg+xml');
    expect(html).not.toContain('api.qrserver.com');
  });

  it('custom variant: LANDING_QR_HINT_HTML cannot inject handlers', () => {
    const html = renderAuthQrPage(
      {
        LANDING_VARIANT: 'custom',
        LANDING_QR_HINT_HTML: '<svg onload=alert(1)>x</svg>',
      },
      'https://liff.line.me/x',
    );
    expect(html).not.toMatch(/<svg[\s>]/i);
    expect(html).toContain('&lt;svg');
  });
});
