import { describe, expect, it } from 'vitest';
import {
  getCfBotScore,
  isCfBotScoreProtectedRoute,
  parseMinCfBotScore,
  shouldBlockForCfBotScore,
} from '../../src/services/cf-bot-guard.js';

function reqWithCf(cf: unknown) {
  const r = new Request('http://localhost/api/auth/login', { method: 'POST' });
  Object.defineProperty(r, 'cf', { value: cf, configurable: true });
  return r;
}

describe('cf-bot-guard', () => {
  describe('parseMinCfBotScore', () => {
    it('returns null when unset or empty', () => {
      expect(parseMinCfBotScore({})).toBeNull();
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: '' })).toBeNull();
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: '   ' })).toBeNull();
    });

    it('returns null for non-numeric or out of range', () => {
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: 'nope' })).toBeNull();
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: '0' })).toBeNull();
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: '100' })).toBeNull();
    });

    it('parses 1–99 inclusive', () => {
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: '1' })).toBe(1);
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: '30' })).toBe(30);
      expect(parseMinCfBotScore({ MIN_CF_BOT_SCORE: '99' })).toBe(99);
    });
  });

  describe('getCfBotScore', () => {
    it('returns undefined when cf or botManagement is missing', () => {
      expect(getCfBotScore(new Request('http://localhost/'))).toBeUndefined();
      expect(getCfBotScore(reqWithCf({}))).toBeUndefined();
      expect(getCfBotScore(reqWithCf({ botManagement: {} }))).toBeUndefined();
    });

    it('reads cf.botManagement.score', () => {
      expect(getCfBotScore(reqWithCf({ botManagement: { score: 42 } }))).toBe(42);
    });
  });

  describe('isCfBotScoreProtectedRoute', () => {
    it('protects login and public affiliate click POST only', () => {
      expect(isCfBotScoreProtectedRoute('/api/auth/login', 'POST')).toBe(true);
      expect(isCfBotScoreProtectedRoute('/api/auth/login', 'GET')).toBe(false);
      expect(isCfBotScoreProtectedRoute('/api/affiliates/click', 'POST')).toBe(true);
      expect(isCfBotScoreProtectedRoute('/api/affiliates/click', 'GET')).toBe(false);
    });

    it('does not protect webhooks or LIFF', () => {
      expect(isCfBotScoreProtectedRoute('/webhook', 'POST')).toBe(false);
      expect(isCfBotScoreProtectedRoute('/api/integrations/stripe/webhook', 'POST')).toBe(false);
      expect(isCfBotScoreProtectedRoute('/api/liff/foo', 'POST')).toBe(false);
    });
  });

  describe('shouldBlockForCfBotScore', () => {
    it('never blocks when min score is not configured', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: null,
          requireCfBotSignal: false,
          pathname: '/api/auth/login',
          method: 'POST',
          score: undefined,
        }),
      ).toEqual({ block: false });
    });

    it('does not block non-protected routes even when min is set', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: 30,
          requireCfBotSignal: false,
          pathname: '/webhook',
          method: 'POST',
          score: 1,
        }),
      ).toEqual({ block: false });
    });

    it('blocks low scores when Bot Management provides a numeric score', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: 30,
          requireCfBotSignal: false,
          pathname: '/api/auth/login',
          method: 'POST',
          score: 29,
        }),
      ).toEqual({ block: true, reason: 'low_bot_score' });
    });

    it('allows scores at or above the threshold', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: 30,
          requireCfBotSignal: false,
          pathname: '/api/auth/login',
          method: 'POST',
          score: 30,
        }),
      ).toEqual({ block: false });
    });

    it('allows when score is missing unless REQUIRE_CF_BOT_SIGNAL is on', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: 30,
          requireCfBotSignal: false,
          pathname: '/api/auth/login',
          method: 'POST',
          score: undefined,
        }),
      ).toEqual({ block: false });
    });

    it('blocks missing score when REQUIRE_CF_BOT_SIGNAL is on', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: 30,
          requireCfBotSignal: true,
          pathname: '/api/auth/login',
          method: 'POST',
          score: undefined,
        }),
      ).toEqual({ block: true, reason: 'missing_bot_signal' });
    });

    it('blocks missing score when only REQUIRE_CF_BOT_SIGNAL is set (no MIN)', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: null,
          requireCfBotSignal: true,
          pathname: '/api/auth/login',
          method: 'POST',
          score: undefined,
        }),
      ).toEqual({ block: true, reason: 'missing_bot_signal' });
    });

    it('allows any numeric score when only REQUIRE_CF_BOT_SIGNAL is set', () => {
      expect(
        shouldBlockForCfBotScore({
          minScore: null,
          requireCfBotSignal: true,
          pathname: '/api/auth/login',
          method: 'POST',
          score: 2,
        }),
      ).toEqual({ block: false });
    });
  });
});
