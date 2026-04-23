import {
  addPoolAccount,
  createTrafficPool,
  deleteTrafficPool,
  getPoolAccounts,
  getTrafficPoolById,
  getTrafficPools,
  removePoolAccount,
  togglePoolAccount,
  updateTrafficPool,
} from '@line-crm/db';
import type { PoolAccount, PoolAccountWithDetails, TrafficPoolWithAccount } from '@line-crm/db';
import {
  resourceLineAccountVisibleInScope,
  type LineAccountScope,
} from '../services/admin-line-account-scope.js';

type TrafficPoolFailure = Readonly<{
  ok: false;
  status: 400 | 403 | 404 | 409;
  body: Readonly<{ success: false; error: string }>;
}>;

const POOL_NOT_FOUND = {
  ok: false,
  status: 404,
  body: { success: false, error: 'Traffic pool not found' },
} as const satisfies TrafficPoolFailure;

const ACCOUNT_FORBIDDEN = {
  ok: false,
  status: 403,
  body: {
    success: false,
    error: 'Forbidden: LINE account not allowed for this principal',
  },
} as const satisfies TrafficPoolFailure;

function accountInScope(scope: LineAccountScope, accountId: string): boolean {
  return resourceLineAccountVisibleInScope(scope, accountId);
}

export function serializePool(pool: TrafficPoolWithAccount) {
  return {
    id: pool.id,
    slug: pool.slug,
    name: pool.name,
    activeAccountId: pool.active_account_id,
    accountName: pool.account_name,
    liffId: pool.liff_id,
    isActive: Boolean(pool.is_active),
    createdAt: pool.created_at,
    updatedAt: pool.updated_at,
  };
}

export function serializePoolAccount(pa: PoolAccountWithDetails) {
  return {
    id: pa.id,
    poolId: pa.pool_id,
    lineAccountId: pa.line_account_id,
    accountName: pa.account_name,
    liffId: pa.liff_id,
    isActive: Boolean(pa.is_active),
    createdAt: pa.created_at,
  };
}

export async function listAdminTrafficPools(
  db: D1Database,
  scope: LineAccountScope,
): Promise<Readonly<{ ok: true; data: ReturnType<typeof serializePool>[] }>> {
  const pools = await getTrafficPools(db);
  const visible = pools.filter((p) => accountInScope(scope, p.active_account_id));
  return { ok: true, data: visible.map(serializePool) };
}

async function resolveVisiblePool(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; pool: TrafficPoolWithAccount }> | TrafficPoolFailure> {
  const pool = await getTrafficPoolById(db, id);
  if (!pool || !accountInScope(scope, pool.active_account_id)) {
    return POOL_NOT_FOUND;
  }
  return { ok: true, pool };
}

export async function createAdminTrafficPool(
  db: D1Database,
  scope: LineAccountScope,
  body: Readonly<{ slug: string; name: string; activeAccountId: string }>,
): Promise<Readonly<{ ok: true; data: ReturnType<typeof serializePool> }> | TrafficPoolFailure> {
  if (!accountInScope(scope, body.activeAccountId)) {
    return ACCOUNT_FORBIDDEN;
  }
  const pool = await createTrafficPool(db, body);
  return { ok: true, data: serializePool(pool) };
}

export async function updateAdminTrafficPool(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
  body: Readonly<{ name?: string; activeAccountId?: string; isActive?: boolean }>,
): Promise<Readonly<{ ok: true; data: ReturnType<typeof serializePool> }> | TrafficPoolFailure> {
  const existing = await resolveVisiblePool(db, scope, id);
  if (!existing.ok) return existing;
  if (body.activeAccountId && !accountInScope(scope, body.activeAccountId)) {
    return ACCOUNT_FORBIDDEN;
  }
  const updated = await updateTrafficPool(db, id, body);
  if (!updated) return POOL_NOT_FOUND;
  return { ok: true, data: serializePool(updated) };
}

export async function deleteAdminTrafficPool(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: null }> | TrafficPoolFailure> {
  const existing = await resolveVisiblePool(db, scope, id);
  if (!existing.ok) return existing;
  await deleteTrafficPool(db, id);
  return { ok: true, data: null };
}

export async function listAdminPoolAccounts(
  db: D1Database,
  scope: LineAccountScope,
  poolId: string,
): Promise<
  Readonly<{ ok: true; data: ReturnType<typeof serializePoolAccount>[] }> | TrafficPoolFailure
> {
  const existing = await resolveVisiblePool(db, scope, poolId);
  if (!existing.ok) return existing;
  const accounts = await getPoolAccounts(db, poolId);
  return { ok: true, data: accounts.map(serializePoolAccount) };
}

export async function addAdminPoolAccount(
  db: D1Database,
  scope: LineAccountScope,
  poolId: string,
  body: Readonly<{ lineAccountId: string }>,
): Promise<Readonly<{ ok: true; data: PoolAccount }> | TrafficPoolFailure> {
  const existing = await resolveVisiblePool(db, scope, poolId);
  if (!existing.ok) return existing;
  if (!accountInScope(scope, body.lineAccountId)) {
    return ACCOUNT_FORBIDDEN;
  }
  try {
    const account = await addPoolAccount(db, poolId, body.lineAccountId);
    return { ok: true, data: account };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE constraint')) {
      return {
        ok: false,
        status: 409,
        body: { success: false, error: 'Account already in this pool' },
      };
    }
    throw err;
  }
}

export async function toggleAdminPoolAccount(
  db: D1Database,
  scope: LineAccountScope,
  poolId: string,
  accountId: string,
  isActive: boolean,
): Promise<Readonly<{ ok: true; data: PoolAccount }> | TrafficPoolFailure> {
  const existing = await resolveVisiblePool(db, scope, poolId);
  if (!existing.ok) return existing;
  const result = await togglePoolAccount(db, accountId, isActive);
  if (!result) {
    return { ok: false, status: 404, body: { success: false, error: 'Not found' } };
  }
  return { ok: true, data: result };
}

export async function deleteAdminPoolAccount(
  db: D1Database,
  scope: LineAccountScope,
  poolId: string,
  accountId: string,
): Promise<Readonly<{ ok: true }> | TrafficPoolFailure> {
  const existing = await resolveVisiblePool(db, scope, poolId);
  if (!existing.ok) return existing;
  const deleted = await removePoolAccount(db, accountId);
  if (!deleted) {
    return { ok: false, status: 404, body: { success: false, error: 'Not found' } };
  }
  return { ok: true };
}
