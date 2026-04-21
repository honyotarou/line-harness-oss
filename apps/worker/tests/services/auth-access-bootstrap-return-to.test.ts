import { describe, expect, it } from 'vitest';
import { sanitizeAccessBootstrapReturnTo } from '../../src/services/auth-access-bootstrap-return-to.js';

describe('sanitizeAccessBootstrapReturnTo', () => {
  it('defaults to /login when missing or blank', () => {
    expect(sanitizeAccessBootstrapReturnTo(undefined)).toBe('/login');
    expect(sanitizeAccessBootstrapReturnTo('')).toBe('/login');
    expect(sanitizeAccessBootstrapReturnTo('   ')).toBe('/login');
  });

  it('allows same-origin relative paths', () => {
    expect(sanitizeAccessBootstrapReturnTo('/login')).toBe('/login');
    expect(sanitizeAccessBootstrapReturnTo('/friends')).toBe('/friends');
    expect(sanitizeAccessBootstrapReturnTo('/broadcasts?x=1')).toBe('/broadcasts?x=1');
  });

  it('rejects open-redirect and protocol tricks', () => {
    expect(sanitizeAccessBootstrapReturnTo('//evil.com')).toBe('/login');
    expect(sanitizeAccessBootstrapReturnTo('/\\evil')).toBe('/login');
    expect(sanitizeAccessBootstrapReturnTo('https://evil.com')).toBe('/login');
    expect(sanitizeAccessBootstrapReturnTo('/foo/../bar')).toBe('/login');
  });

  it('rejects overlong paths', () => {
    expect(sanitizeAccessBootstrapReturnTo(`/${'a'.repeat(300)}`)).toBe('/login');
  });
});
