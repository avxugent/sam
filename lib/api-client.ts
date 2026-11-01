/**
 * fetch() for client components talking to our own JSON API. Never throws:
 * a network failure comes back as `{ ok: false, status: 0 }` and a missing or
 * non-JSON body as `{}`, so callers handle every outcome in one `if (!r.ok)`
 * and a loading flag can never get stuck on a rejected promise. Show
 * `r.error` with apiErrorMessage() below.
 */
export type ApiErrorBody = { error?: string; code?: string; details?: unknown } & Record<string, unknown>;

/**
 * User-facing text for an API error body. Every route answers
 * `{ error: string, code?: string, details? }`: `error` is readable English,
 * `code` a stable identifier for clients that localize a specific case (e.g.
 * "supplierWindowOverlap"), and `details` is either `string[]` (template and
 * pattern problems, conflicting names), appended here, or Zod's structured
 * object from invalidInput, which is not meant for display and is ignored.
 */
export function apiErrorMessage(body: Pick<ApiErrorBody, "error" | "details">, fallback = ""): string {
  const details = Array.isArray(body.details) ? body.details.filter((d): d is string => typeof d === "string") : [];
  const message = body.error ?? fallback;
  return details.length > 0 ? `${message}: ${details.join("; ")}` : message;
}

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
    saveBlob(await res.blob(), filename);
    return true;
  } catch {
    return false;
  }
}

/** Hands `blob` to the browser as a download named `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
