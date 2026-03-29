import { describe, expect, it } from 'vitest';
import { assertLiffProductionApiUrl } from './build-env-guard.js';

describe('assertLiffProductionApiUrl', () => {
  it('does nothing in development mode', () => {
    expect(() => assertLiffProductionApiUrl('development', undefined, {})).not.toThrow();
    expect(() => assertLiffProductionApiUrl('development', '', {})).not.toThrow();
  });

  it('throws in production when VITE_API_URL is missing', () => {
    expect(() => assertLiffProductionApiUrl('production', undefined, {})).toThrow(
      /requires VITE_API_URL/,
    );
    expect(() => assertLiffProductionApiUrl('production', '   ', {})).toThrow(
      /requires VITE_API_URL/,
    );
  });

  it('allows production when VITE_API_URL is non-empty', () => {
    expect(() => assertLiffProductionApiUrl('production', ' https://w.example ', {})).not.toThrow();
  });

  it('allows empty when VITE_ALLOW_EMPTY_LIFF_API=1', () => {
    expect(() =>
      assertLiffProductionApiUrl('production', undefined, { VITE_ALLOW_EMPTY_LIFF_API: '1' }),
    ).not.toThrow();
  });
});
