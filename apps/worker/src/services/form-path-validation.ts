import type { Context } from 'hono';
import { isSafePathSegmentResourceId } from '@line-crm/shared';
import type { Env } from '../index.js';

export function rejectInvalidFormPathId(c: Context<Env>): Response | null {
  const id = c.req.param('id') ?? '';
  if (!isSafePathSegmentResourceId(id)) {
    return c.json({ success: false, error: 'Invalid form id' }, 400);
  }
  return null;
}
