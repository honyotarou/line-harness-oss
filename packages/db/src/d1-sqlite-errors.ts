const NO_SUCH_TABLE = /no such table/i;

/**
 * Detects SQLite/D1 "no such table" failures (e.g. migration not applied on remote D1).
 */
export function isD1NoSuchTableError(err: unknown, tableName: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const needle = tableName.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  return NO_SUCH_TABLE.test(msg) && msg.toLowerCase().includes(needle);
}
