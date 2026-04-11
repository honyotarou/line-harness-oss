import { canonicalRequestPathname } from './auth-paths.js';

/**
 * Optional Cloudflare Bot Management integration: block very low scores on a few
 * abuse-prone public POST endpoints (credential stuffing, affiliate click fraud).
 * Requires Bot Management on the zone; when `cf.botManagement.score` is absent
 * (local dev / plan without BM), checks are skipped unless REQUIRE_CF_BOT_SIGNAL is on.
 */

export type CfBotGuardEnv = {
  MIN_CF_BOT_SCORE?: string;
  REQUIRE_CF_BOT_SIGNAL?: string;
};

type CfRequest = Request & {
  cf?: {
    botManagement?: {
      score?: number;
    };
  };
};

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function parseMinCfBotScore(env: CfBotGuardEnv): number | null {
  const raw = env.MIN_CF_BOT_SCORE?.trim();
  if (!raw) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 99) {
    return null;
  }
  return n;
}

export function requireCfBotSignal(env: CfBotGuardEnv): boolean {
  return isTruthyEnvFlag(env.REQUIRE_CF_BOT_SIGNAL);
}

export function getCfBotScore(request: Request): number | undefined {
  const score = (request as CfRequest).cf?.botManagement?.score;
  return typeof score === 'number' && Number.isFinite(score) ? score : undefined;
}

export function isCfBotScoreProtectedRoute(pathname: string, method: string): boolean {
  if (method !== 'POST') {
    return false;
  }
  const path = canonicalRequestPathname(pathname);
  return path === '/api/auth/login' || path === '/api/affiliates/click';
}

export type CfBotBlockDecision =
  | { block: false }
  | { block: true; reason: 'low_bot_score' | 'missing_bot_signal' };

export function shouldBlockForCfBotScore(input: {
  minScore: number | null;
  requireCfBotSignal: boolean;
  pathname: string;
  method: string;
  score: number | undefined;
}): CfBotBlockDecision {
  if (input.minScore === null && !input.requireCfBotSignal) {
    return { block: false };
  }
  if (!isCfBotScoreProtectedRoute(input.pathname, input.method)) {
    return { block: false };
  }
  if (input.score === undefined) {
    if (input.requireCfBotSignal) {
      return { block: true, reason: 'missing_bot_signal' };
    }
    return { block: false };
  }
  if (input.minScore !== null && input.score < input.minScore) {
    return { block: true, reason: 'low_bot_score' };
  }
  return { block: false };
}
