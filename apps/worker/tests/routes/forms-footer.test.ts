import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORM_SUBMIT_FLEX_FOOTER,
  resolveFormSubmitFlexFooterText,
} from '../../src/routes/forms.js';

describe('resolveFormSubmitFlexFooterText', () => {
  it('returns default when unset or blank', () => {
    expect(resolveFormSubmitFlexFooterText({})).toBe(DEFAULT_FORM_SUBMIT_FLEX_FOOTER);
    expect(resolveFormSubmitFlexFooterText({ FORM_SUBMIT_FLEX_FOOTER: '' })).toBe(
      DEFAULT_FORM_SUBMIT_FLEX_FOOTER,
    );
    expect(resolveFormSubmitFlexFooterText({ FORM_SUBMIT_FLEX_FOOTER: '   ' })).toBe(
      DEFAULT_FORM_SUBMIT_FLEX_FOOTER,
    );
  });

  it('returns trimmed custom text when set', () => {
    expect(resolveFormSubmitFlexFooterText({ FORM_SUBMIT_FLEX_FOOTER: '  カスタム注記  ' })).toBe(
      'カスタム注記',
    );
  });

  it('default copy must not contain sample vendor placeholder', () => {
    expect(DEFAULT_FORM_SUBMIT_FLEX_FOOTER).not.toContain('L社');
  });
});
