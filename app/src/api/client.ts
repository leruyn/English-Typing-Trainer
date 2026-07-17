/**
 * Thin fetch wrapper shared by every endpoint function in `endpoints.ts`.
 *
 * Responsibilities:
 * - Prefix every request with {@link API_BASE_URL}.
 * - Attach the stored bearer token automatically (unless `auth: false`).
 * - Parse the server's `{ error: string }` JSON error shape (see
 *   `server/src/lib/errors.ts` / the centralized Express error handler)
 *   into a typed {@link ApiError} so callers can branch on `status`.
 * - Distinguish "the server responded with an error" from "the request
 *   never reached the server" (`ApiError.isNetworkError`), which is the
 *   signal the offline attempt queue (`src/offline/attemptQueue.ts`) uses
 *   to decide whether to queue-and-retry-later vs. surface a real error.
 */
import { API_BASE_URL } from "./config";
import { getStoredToken } from "./authStorage";

export class ApiError extends Error {
  status: number;
  isNetworkError: boolean;

  constructor(message: string, status: number, isNetworkError = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  /** Explicit token override, used right after login/register before the
   * token has been persisted/read back from SecureStore yet. */
  token?: string;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, token: tokenOverride } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (auth) {
    const token = tokenOverride ?? (await getStoredToken());
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // fetch() itself threw: no connectivity, DNS failure, the free-tier
    // instance timing out mid-wake, etc. Callers that want offline
    // queueing (practice attempts) check `isNetworkError` for this.
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new ApiError(message, 0, true);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: string };
      if (errorBody.error) message = errorBody.error;
    } catch {
      // Response body wasn't JSON (e.g. a Render error page) - keep the
      // generic status-based message.
    }
    throw new ApiError(message, response.status);
  }

  // No-content responses (rare in this API, but guard anyway).
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
