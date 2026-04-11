const textEncoder = new TextEncoder();

/** Default cap for authenticated admin JSON POST/PUT/PATCH bodies (DoS mitigation). */
export const DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES = 256 * 1024;

/** Raw body cap for Stripe webhooks before HMAC verification (DoS mitigation). */
export const STRIPE_WEBHOOK_RAW_BODY_LIMIT_BYTES = 1024 * 1024;

/** Cap for unauthenticated LIFF-facing JSON (LINE ID token payloads, small actions). */
export const DEFAULT_PUBLIC_JSON_BODY_LIMIT_BYTES = 64 * 1024;

/** JSON cap for rich-menu image upload when body is base64 in JSON (binary upload uses arrayBuffer separately). */
export const RICH_MENU_IMAGE_JSON_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`Request body exceeds ${limitBytes} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super('Invalid JSON body');
    this.name = 'InvalidJsonBodyError';
  }
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

export async function readTextBodyWithLimit(request: Request, limitBytes: number): Promise<string> {
  const contentLength = getContentLength(request);
  if (contentLength !== null && contentLength > limitBytes) {
    throw new BodyTooLargeError(limitBytes);
  }

  const text = await request.text();
  if (textEncoder.encode(text).byteLength > limitBytes) {
    throw new BodyTooLargeError(limitBytes);
  }

  return text;
}

export async function readJsonBodyWithLimit<T>(request: Request, limitBytes: number): Promise<T> {
  const text = await readTextBodyWithLimit(request, limitBytes);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new InvalidJsonBodyError();
  }
}

/** Use in route catch blocks after readJsonBodyWithLimit / readTextBodyWithLimit. */
export function jsonBodyReadErrorResponse(
  err: unknown,
): { status: 400 | 413; body: { success: false; error: string } } | null {
  if (err instanceof BodyTooLargeError) {
    return { status: 413, body: { success: false, error: 'Request body too large' } };
  }
  if (err instanceof InvalidJsonBodyError) {
    return { status: 400, body: { success: false, error: 'Invalid JSON body' } };
  }
  return null;
}
