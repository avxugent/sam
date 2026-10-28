/**
 * fetch() for client components talking to our own JSON API. Never throws:
 * a network failure comes back as `{ ok: false, status: 0 }` and a missing or
 * non-JSON body as `{}`, so callers handle every outcome in one `if (!r.ok)`
 * and a loading flag can never get stuck on a rejected promise. Show
 * `r.error` with apiErrorMessage() from lib/utils.ts.
 */
export type ApiErrorBody = { error?: string; code?: string; details?: unknown } & Record<string, unknown>;

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiErrorBody };

export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, error: {} };
  }
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    // No JSON body (e.g. a 500 from the platform, or a 204).
  }
  return res.ok
    ? { ok: true, status: res.status, data: body as T }
    : { ok: false, status: res.status, error: (body ?? {}) as ApiErrorBody };
}

/** RequestInit for a JSON request body. */
export function jsonBody(method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * Downloads `url` as a file named `filename` (CSV exports). Resolves to false
 * when the request fails or is refused, so the caller can toast; never throws.
 */
export async function downloadFile(url: string, filename: string): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(url);
    if (!res.ok) return false;
    const objectUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}
