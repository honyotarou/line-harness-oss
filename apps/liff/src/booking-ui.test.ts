import { describe, expect, it } from 'vitest';
import {
  renderBookingErrorCardHtml,
  renderPhoneFallbackHtml,
  type PhoneFallbackInfo,
} from './booking.js';

describe('LIFF booking UI — phone fallback', () => {
  const fallback: PhoneFallbackInfo = {
    telUri: 'tel:0312345678',
    message: 'オンラインで予約を完了できない場合は、お電話にてご連絡ください。',
  };

  it('renders a tel: CTA when fallback info is available', () => {
    const html = renderPhoneFallbackHtml(fallback);
    expect(html).toContain('href="tel:0312345678"');
    expect(html).toContain('電話で相談する');
  });

  it('includes phone CTA on error card (no blank-end failures)', () => {
    const html = renderBookingErrorCardHtml({
      message: '予約に失敗しました',
      phoneFallback: fallback,
      showRetry: true,
    });
    expect(html).toContain('予約に失敗しました');
    expect(html).toContain('href="tel:0312345678"');
    expect(html).toContain('電話で相談する');
    expect(html).toContain('data-action="retry"');
  });
});
