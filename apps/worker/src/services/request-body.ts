const textEncoder = new TextEncoder();

/** Default cap for authenticated admin JSON POST/PUT/PATCH bodies (DoS mitigation). */
export const DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES = 256 * 1024;

/** Raw body cap for Stripe webhooks before HMAC verification (DoS mitigation). */
export const STRIPE_WEBHOOK_RAW_BODY_LIMIT_BYTES = 1024 * 1024;

/** Cap for unauthenticated LIFF-facing JSON (LINE ID token payloads, small actions). */
export const DEFAULT_PUBLIC_JSON_BODY_LIMIT_BYTES = 64 * 1024;

/** JSON cap for rich-menu image upload when body is base64 in JSON (binary upload uses arrayBuffer separately). */
export const RICH_MENU_IMAGE_JSON_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

/** Same cap for `Content-Type: image/*` uploads (binary path must match JSON path). */
export const RICH_MENU_IMAGE_BINARY_MAX_BYTES = RICH_MENU_IMAGE_JSON_BODY_LIMIT_BYTES;

export type BodyTooLargeError = Error &
  Readonly<{
    name: 'BodyTooLargeError';
    limitBytes: number;
  }>;

export function createBodyTooLargeError(limitBytes: number): BodyTooLargeError {
  return Object.assign(new Error(`Request body exceeds ${limitBytes} bytes`), {
    name: 'BodyTooLargeError' as const,
    limitBytes,
  });
}

export type InvalidJsonBodyError = Error &
  Readonly<{
    name: 'InvalidJsonBodyError';
  }>;

export function createInvalidJsonBodyError(): InvalidJsonBodyError {
  return Object.assign(new Error('Invalid JSON body'), {
    name: 'InvalidJsonBodyError' as const,
  });
}

export function isBodyTooLargeError(err: unknown): err is BodyTooLargeError {
  return (
    err instanceof Error &&
    err.name === 'BodyTooLargeError' &&
    typeof (err as { limitBytes?: unknown }).limitBytes === 'number'
  );
}

export function isInvalidJsonBodyError(err: unknown): err is InvalidJsonBodyError {
  return err instanceof Error && err.name === 'InvalidJsonBodyError';
}

function getContentLength(request: Request): number | null {
  const headerValue = request.headers.get('content-length');
  if (!headerValue) {
    return null;
  }

  const contentLength = Number.parseInt(headerValue, 10);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return null;
  }
  return contentLength;
}

/** Reject early when `Content-Length` exceeds cap (binary uploads). */
export function assertRequestContentLengthWithinLimit(request: Request, limitBytes: number): void {
  const cl = getContentLength(request);
  if (cl !== null && cl > limitBytes) {
    throw createBodyTooLargeError(limitBytes);
  }
}

export function assertArrayBufferWithinLimit(buf: ArrayBuffer, limitBytes: number): void {
  if (buf.byteLength > limitBytes) {
    throw createBodyTooLargeError(limitBytes);
  }
}

export async function readTextBodyWithLimit(request: Request, limitBytes: number): Promise<string> {
  const contentLength = getContentLength(request);
  if (contentLength !== null && contentLength > limitBytes) {
    throw createBodyTooLargeError(limitBytes);
  }

  const text = await request.text();
  if (textEncoder.encode(text).byteLength > limitBytes) {
    throw createBodyTooLargeError(limitBytes);
  }

  return text;
}

export async function readJsonBodyWithLimit<T>(
  request: Request,
  limitBytes: number,
): Promise<Readonly<T>> {
  const text = await readTextBodyWithLimit(request, limitBytes);

  try {
    return JSON.parse(text) as Readonly<T>;
  } catch {
    throw createInvalidJsonBodyError();
  }
}

/** Use in route catch blocks after readJsonBodyWithLimit / readTextBodyWithLimit. */
export function jsonBodyReadErrorResponse(
  err: unknown,
): { status: 400 | 413; body: { success: false; error: string } } | null {
  if (isBodyTooLargeError(err)) {
    return { status: 413, body: { success: false, error: 'Request body too large' } };
  }
  if (isInvalidJsonBodyError(err)) {
    return { status: 400, body: { success: false, error: 'Invalid JSON body' } };
  }
  return null;
}
