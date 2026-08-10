/** Shared outbound HTTP helper: timeout, one retry, friendly errors. */

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} from ${url}`);
  }
}

export type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
};

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { headers, timeoutMs = 20_000, retries = 1 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "msbv/0.1 (personal fantasy tool)", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (res.status >= 500 && attempt < retries) {
        lastError = new HttpError(res.status, url);
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, url);
      return res;
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && err.status < 500) throw err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return await res.text();
}
