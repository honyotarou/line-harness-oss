export type LineHarnessError = Error &
  Readonly<{
    name: 'LineHarnessError';
    status: number;
    endpoint: string;
  }>;

export function createLineHarnessError(
  message: string,
  status: number,
  endpoint: string,
): LineHarnessError {
  return Object.assign(new Error(message), {
    name: 'LineHarnessError' as const,
    status,
    endpoint,
  });
}

export function isLineHarnessError(err: unknown): err is LineHarnessError {
  return (
    err instanceof Error &&
    err.name === 'LineHarnessError' &&
    typeof (err as { status?: unknown }).status === 'number' &&
    typeof (err as { endpoint?: unknown }).endpoint === 'string'
  );
}
