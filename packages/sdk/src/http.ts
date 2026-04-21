import { createLineHarnessError } from './errors.js';

export type HttpClientConfig = Readonly<{
  baseUrl: string;
  apiKey: string;
  timeout: number;
}>;

export type HttpClient = Readonly<{
  get: <T = unknown>(path: string) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  delete: <T = unknown>(path: string) => Promise<T>;
}>;

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const apiKey = config.apiKey;
  const timeout = config.timeout;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeout),
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`;
      try {
        const errorBody = (await res.json()) as { error?: string };
        if (errorBody.error) errorMessage = errorBody.error;
      } catch {
        // ignore parse errors
      }
      throw createLineHarnessError(errorMessage, res.status, `${method} ${path}`);
    }

    return res.json() as Promise<T>;
  }

  return {
    get<T = unknown>(path: string) {
      return request<T>('GET', path);
    },
    post<T = unknown>(path: string, body?: unknown) {
      return request<T>('POST', path, body);
    },
    put<T = unknown>(path: string, body?: unknown) {
      return request<T>('PUT', path, body);
    },
    delete<T = unknown>(path: string) {
      return request<T>('DELETE', path);
    },
  };
}
