import { describe, expect, it } from 'vitest';
import {
  hostnameFromHostHeader,
  isHostAllowed,
  parseAllowedHostnames,
  shouldEnforceHostAllowlist,
} from '../../src/services/host-policy.js';

describe('host-policy', () => {
  describe('hostnameFromHostHeader', () => {
    it('strips port for IPv4 hostnames', () => {
      expect(hostnameFromHostHeader('127.0.0.1:8787')).toBe('127.0.0.1');
      expect(hostnameFromHostHeader('EXAMPLE.COM:443')).toBe('example.com');
    });

    it('handles bracketed IPv6 with port', () => {
      expect(hostnameFromHostHeader('[::1]:8787')).toBe('::1');
    });

    it('returns null for empty or missing', () => {
      expect(hostnameFromHostHeader(undefined)).toBeNull();
      expect(hostnameFromHostHeader('')).toBeNull();
      expect(hostnameFromHostHeader('   ')).toBeNull();
    });

    it('returns null when Host contains control bytes (do not rely on URL stripping newlines)', () => {
      expect(hostnameFromHostHeader('exam\nple.com')).toBeNull();
      expect(hostnameFromHostHeader('exam\r\nple.com')).toBeNull();
      expect(hostnameFromHostHeader('api.example.com\u0000.evil')).toBeNull();
    });
  });

  describe('parseAllowedHostnames', () => {
    it('parses comma-separated hostnames and lowercases', () => {
      const set = parseAllowedHostnames(' API.Example.com , workers.dev  ');
      expect([...set].sort()).toEqual(['api.example.com', 'workers.dev']);
    });

    it('returns empty set for unset or blank', () => {
      expect(parseAllowedHostnames(undefined).size).toBe(0);
      expect(parseAllowedHostnames('').size).toBe(0);
      expect(parseAllowedHostnames(' , , ').size).toBe(0);
    });
  });

  describe('shouldEnforceHostAllowlist', () => {
    it('is false when no allowlist is configured', () => {
      expect(shouldEnforceHostAllowlist(undefined)).toBe(false);
      expect(shouldEnforceHostAllowlist('')).toBe(false);
    });

    it('is true when at least one hostname is present', () => {
      expect(shouldEnforceHostAllowlist('api.example.com')).toBe(true);
    });
  });

  describe('isHostAllowed', () => {
    it('rejects Host values that contain control bytes even if URL parsing would merge them', () => {
      const allowed = new Set(['example.com']);
      expect(isHostAllowed('exam\nple.com', allowed)).toBe(false);
      expect(isHostAllowed('example.com', allowed)).toBe(true);
    });
  });
});
