const textEncoder = new TextEncoder();

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
  return Number.isFinite(contentLength) ? contentLength : null;
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
