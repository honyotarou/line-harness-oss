import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import {
  getCfBotScore,
  parseMinCfBotScore,
  requireCfBotSignal,
  shouldBlockForCfBotScore,
} from '../services/cf-bot-guard.js';

export async function cfBotGuardMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  const minScore = parseMinCfBotScore(c.env);
  const requireSignal = requireCfBotSignal(c.env);
  if (minScore === null && !requireSignal) {
    return next();
  }

  const url = new URL(c.req.url);
  const decision = shouldBlockForCfBotScore({
    minScore,
    requireCfBotSignal: requireSignal,
    pathname: url.pathname,
    method: c.req.method,
    score: getCfBotScore(c.req.raw),
  });

  if (decision.block) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  return next();
}
