import {
  deleteCalendarConnection,
  getCalendarBookings,
  getCalendarConnectionById,
  getCalendarConnections,
  updateCalendarBookingStatus,
} from '@line-crm/db';
import type { Env } from '../index.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  type LineAccountScope,
} from '../services/admin-line-account-scope.js';
import { effectiveRequireCalendarTokenEncryption } from '../services/deployed-security-defaults.js';
import {
  computeCalendarAvailabilitySlots,
  connectGoogleCalendar,
  createBookingWithOptionalGoogleEvent,
  mapBookingRowToApi,
  mapCalendarConnectionListItem,
  mapCreatedBookingToApi,
  mapCreatedConnectionResponse,
  tryDeleteGoogleEventForCancelledBooking,
} from './calendar-integration.js';

type WorkerBindings = Env['Bindings'];

type ConnFailure = Readonly<{
  ok: false;
  status: 400 | 403 | 404;
  body: Readonly<{ success: false; error: string; code?: string }>;
}>;

const CONN_NOT_FOUND = {
  ok: false,
  status: 404,
  body: { success: false, error: 'Calendar connection not found' },
} as const satisfies ConnFailure;

function calendarDeps(env: WorkerBindings) {
  return {
    db: env.DB,
    calendarTokenEncryptionSecret: env.CALENDAR_TOKEN_ENCRYPTION_SECRET,
    requireCalendarTokenEncryption: effectiveRequireCalendarTokenEncryption(env),
  };
}

/**
 * Single gate for every calendar operation that references an existing
 * connection. Keeps scope policy in one place so new call sites cannot skip it.
 */
export async function findConnectionInScope(
  db: D1Database,
  scope: LineAccountScope,
  connectionId: string,
): Promise<Readonly<{ ok: true; lineAccountId: string | null }> | ConnFailure> {
  const conn = await getCalendarConnectionById(db, connectionId);
  if (!conn || !resourceLineAccountVisibleInScope(scope, conn.line_account_id)) {
    return CONN_NOT_FOUND;
  }
  return { ok: true, lineAccountId: conn.line_account_id };
}

export async function listAdminCalendarConnections(
  db: D1Database,
  scope: LineAccountScope,
): Promise<Readonly<{ ok: true; data: ReturnType<typeof mapCalendarConnectionListItem>[] }>> {
  const items = await getCalendarConnections(db);
  const visible = items.filter((conn) =>
    resourceLineAccountVisibleInScope(scope, conn.line_account_id),
  );
  return { ok: true, data: visible.map(mapCalendarConnectionListItem) };
}

export async function createAdminCalendarConnection(
  env: WorkerBindings,
  scope: LineAccountScope,
  body: Readonly<{
    calendarId: string;
    authType: string;
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    lineAccountId?: string | null;
  }>,
): Promise<
  | Readonly<{
      ok: true;
      data: ReturnType<typeof mapCreatedConnectionResponse>;
      lineAccountId: string | null;
    }>
  | ConnFailure
> {
  const acc = validateScopedLineAccountBody(scope, body.lineAccountId);
  if (!acc.ok) {
    return { ok: false, status: acc.status, body: jsonBodyForLineAccountScopeFailure(acc) };
  }
  const conn = await connectGoogleCalendar(calendarDeps(env), {
    ...body,
    lineAccountId: acc.lineAccountId,
  });
  return {
    ok: true,
    data: mapCreatedConnectionResponse(conn),
    lineAccountId: acc.lineAccountId,
  };
}

export async function deleteAdminCalendarConnection(
  db: D1Database,
  scope: LineAccountScope,
  connectionId: string,
): Promise<Readonly<{ ok: true; data: null }> | ConnFailure> {
  const gate = await findConnectionInScope(db, scope, connectionId);
  if (!gate.ok) return gate;
  await deleteCalendarConnection(db, connectionId);
  return { ok: true, data: null };
}

export async function listAdminCalendarBookings(
  db: D1Database,
  scope: LineAccountScope,
  query: Readonly<{ connectionId?: string; friendId?: string }>,
): Promise<Readonly<{ ok: true; data: ReturnType<typeof mapBookingRowToApi>[] }> | ConnFailure> {
  if (query.connectionId) {
    const gate = await findConnectionInScope(db, scope, query.connectionId);
    if (!gate.ok) return gate;
  }
  const items = await getCalendarBookings(db, {
    connectionId: query.connectionId,
    friendId: query.friendId,
  });
  return { ok: true, data: items.map(mapBookingRowToApi) };
}

export async function createAdminCalendarBooking(
  env: WorkerBindings,
  scope: LineAccountScope,
  body: Readonly<{
    connectionId: string;
    friendId?: string;
    title: string;
    startAt: string;
    endAt: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<Readonly<{ ok: true; data: ReturnType<typeof mapCreatedBookingToApi> }> | ConnFailure> {
  const gate = await findConnectionInScope(env.DB, scope, body.connectionId);
  if (!gate.ok) return gate;
  const booking = await createBookingWithOptionalGoogleEvent(calendarDeps(env), body);
  return { ok: true, data: mapCreatedBookingToApi(booking) };
}

export async function computeAdminCalendarSlots(
  env: WorkerBindings,
  scope: LineAccountScope,
  input: Readonly<{
    connectionId: string;
    date: string;
    slotMinutes: number;
    startHour: number;
    endHour: number;
  }>,
): Promise<
  | Readonly<{ ok: true; slots: Awaited<ReturnType<typeof computeCalendarAvailabilitySlots>> }>
  | ConnFailure
> {
  const gate = await findConnectionInScope(env.DB, scope, input.connectionId);
  if (!gate.ok) return gate;
  const res = await computeCalendarAvailabilitySlots(calendarDeps(env), input);
  if (!res.ok) {
    return {
      ok: false,
      status: (res.status as 400 | 403 | 404) ?? 400,
      body: { success: false, error: res.error },
    };
  }
  return { ok: true, slots: res.slots as never };
}

export async function updateAdminCalendarBookingStatus(
  env: WorkerBindings,
  id: string,
  status: string,
): Promise<Readonly<{ ok: true; data: null }>> {
  await tryDeleteGoogleEventForCancelledBooking(calendarDeps(env), id, status);
  await updateCalendarBookingStatus(env.DB, id, status);
  return { ok: true, data: null };
}
