import { describe, expect, it } from 'vitest';
import {
  parseAnxietyPostbackData,
  welcomeAnxietyFlowEnabled,
  buildWelcomeAnxietyFlexMessage,
  buildAnxietyFollowupFlexMessage,
  ANXIETY_POSTBACK_PREFIX,
} from '../../src/services/welcome-anxiety-flow.js';

describe('welcome anxiety flow', () => {
  it('parseAnxietyPostbackData accepts anxiety=key and url-encoded', () => {
    expect(parseAnxietyPostbackData(`${ANXIETY_POSTBACK_PREFIX}accident`)).toBe('accident');
    expect(parseAnxietyPostbackData('anxiety%3Dortho')).toBe('ortho');
    expect(parseAnxietyPostbackData(' other=1 ')).toBeNull();
    expect(parseAnxietyPostbackData('anxiety=unknown')).toBeNull();
  });

  it('welcomeAnxietyFlowEnabled reads common truthy strings', () => {
    expect(welcomeAnxietyFlowEnabled({ WELCOME_ANXIETY_FLOW: '1' } as never)).toBe(true);
    expect(welcomeAnxietyFlowEnabled({ WELCOME_ANXIETY_FLOW: 'true' } as never)).toBe(true);
    expect(welcomeAnxietyFlowEnabled({ WELCOME_ANXIETY_FLOW: 'YES' } as never)).toBe(true);
    expect(welcomeAnxietyFlowEnabled({ WELCOME_ANXIETY_FLOW: '0' } as never)).toBe(false);
    expect(welcomeAnxietyFlowEnabled({} as never)).toBe(false);
  });

  it('buildWelcomeAnxietyFlexMessage includes category postback actions', () => {
    const msg = buildWelcomeAnxietyFlexMessage({
      LIFF_URL: 'https://liff.line.me/123-abc',
      WORKER_URL: 'https://worker.example',
    } as never);
    expect(msg.type).toBe('flex');
    if (msg.type !== 'flex') return;
    const json = JSON.stringify(msg.contents);
    expect(json).toContain(`${ANXIETY_POSTBACK_PREFIX}accident`);
    expect(json).toContain(`${ANXIETY_POSTBACK_PREFIX}ortho`);
    expect(json).toContain(`${ANXIETY_POSTBACK_PREFIX}iv`);
    expect(json).toContain('"type":"postback"');
  });

  it('buildAnxietyFollowupFlexMessage uses LIFF_BOOKING_URL when set', () => {
    const msg = buildAnxietyFollowupFlexMessage('ortho', {
      LIFF_URL: 'https://liff.line.me/default',
      LIFF_BOOKING_URL: 'https://liff.line.me/booking-only',
      WORKER_URL: 'https://worker.example',
      BOOKING_FALLBACK_TEL: 'tel:0312345678',
    } as never);
    expect(msg.type).toBe('flex');
    if (msg.type !== 'flex') return;
    const json = JSON.stringify(msg.contents);
    expect(json).toContain('https://liff.line.me/booking-only');
    expect(json).toContain('予約');
    expect(json).toContain('tel:0312345678');
  });

  it('buildAnxietyFollowupFlexMessage omits LIFF button when WELCOME_ANXIETY_RICH_MENU_ONLY', () => {
    const msg = buildAnxietyFollowupFlexMessage('ortho', {
      LIFF_URL: 'https://liff.line.me/default',
      WELCOME_ANXIETY_RICH_MENU_ONLY: '1',
      WORKER_URL: 'https://worker.example',
      BOOKING_FALLBACK_TEL: 'tel:0312345678',
    } as never);
    expect(msg.type).toBe('flex');
    if (msg.type !== 'flex') return;
    const json = JSON.stringify(msg.contents);
    expect(json).not.toContain('liff.line.me');
    expect(json).toContain('リッチメニュー「予約」');
  });

  it('buildAnxietyFollowupFlexMessage for accident is phone-first', () => {
    const msg = buildAnxietyFollowupFlexMessage('accident', {
      LIFF_URL: 'https://liff.line.me/default',
      WORKER_URL: 'https://worker.example',
      BOOKING_FALLBACK_TEL: 'tel:0312345678',
    } as never);
    expect(msg.type).toBe('flex');
    if (msg.type !== 'flex') return;
    const json = JSON.stringify(msg.contents);
    expect(json).toContain('tel:0312345678');
    expect(json).not.toContain('予約ページへ（メニューと同じ）');
  });
});
