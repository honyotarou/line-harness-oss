import { describe, expect, it } from 'vitest';
import { summarizeFlexJsonForPreview } from './flex-preview-summary.js';

describe('summarizeFlexJsonForPreview', () => {
  it('rejects non-objects', () => {
    expect(summarizeFlexJsonForPreview('[]').ok).toBe(false);
    expect(summarizeFlexJsonForPreview('"x"').ok).toBe(false);
  });

  it('summarizes bubble flex', () => {
    const s = summarizeFlexJsonForPreview(
      JSON.stringify({ type: 'bubble', altText: 'Hi', body: { type: 'box', layout: 'vertical' } }),
    );
    expect(s.ok).toBe(true);
    expect(s.typeLabel).toBe('bubble');
    expect(s.altText).toBe('Hi');
    expect(s.sizeHint).toContain('バブル');
  });

  it('summarizes carousel contents count', () => {
    const s = summarizeFlexJsonForPreview(
      JSON.stringify({
        type: 'carousel',
        altText: 'C',
        contents: [{ type: 'bubble' }, { type: 'bubble' }],
      }),
    );
    expect(s.ok).toBe(true);
    expect(s.typeLabel).toBe('carousel');
    expect(s.sizeHint).toMatch(/2/);
  });
});
