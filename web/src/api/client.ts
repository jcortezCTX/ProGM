import { clearToken, getToken } from "../auth/token";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export interface ApiFieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  // Populated when the API's error body includes a `fields` array (e.g.
  // asset attribute/geometry validation - spec 5.1: "return field-level
  // validation errors, not a generic 400"). Undefined for every other
  // error shape, which is still just `{ error: string }`.
  fields?: ApiFieldError[];

  constructor(status: number, message: string, fields?: ApiFieldError[]) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// Serializes list-query params into a query string, dropping undefined
// values so callers can pass a full params object without conditionally
// building it up field by field.
export function buildQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  // Only treat this as a session expiring — a fresh /auth/login 401 (bad
  // password, no token yet) is a normal ApiError the caller displays inline.
  if (res.status === 401 && token) {
    clearToken();
    window.dispatchEvent(new Event("auth:unauthorized"));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText, body.fields);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
