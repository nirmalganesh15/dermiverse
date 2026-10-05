/** Thin fetch wrapper: JWT auth with silent refresh, JSON in/out, readable error messages. */

const ACCESS_KEY = "dv.access";
const REFRESH_KEY = "dv.refresh";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

export const tokens = {
  get access() {
    return read(ACCESS_KEY);
  },
  set(access: string, refresh?: string) {
    write(ACCESS_KEY, access);
    if (refresh) write(REFRESH_KEY, refresh);
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
  get refresh() {
    return read(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

let refreshing: Promise<boolean> | null = null;
async function refreshAccess(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  refreshing ??= fetch("/api/auth/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const data = await r.json();
      tokens.set(data.access, data.refresh);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Flatten DRF error payloads into one friendly message + per-field messages. */
function parseError(status: number, body: unknown): ApiError {
  const fields: Record<string, string> = {};
  let message = "Something went wrong. Please try again.";
  const first = (v: unknown): string | undefined => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      for (const x of v) {
        const s = first(x);
        if (s) return s;
      }
    }
    if (v && typeof v === "object") {
      for (const x of Object.values(v)) {
        const s = first(x);
        if (s) return s;
      }
    }
    return undefined;
  };
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      const s = first(v);
      if (s) fields[k] = s;
    }
    message = fields.detail ?? fields.non_field_errors ?? Object.values(fields)[0] ?? message;
  }
  if (status === 403 && !fields.detail) message = "You don't have permission to do this.";
  if (status >= 500) message = "The server had a problem. Please try again in a moment.";
  return new ApiError(status, message, fields);
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch {
    throw new ApiError(0, "Can't reach the clinic server. Check that it is running and you're on the clinic network.");
  }
  if (res.status === 401 && retry && (await refreshAccess())) {
    return api<T>(path, init, false);
  }
  if (res.status === 401) {
    tokens.clear();
    onUnauthorized();
    throw new ApiError(401, "Your session has ended. Please sign in again.");
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    throw parseError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("Content-Type") ?? "";
  return (type.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

export function qs(params: Record<string, string | number | undefined | null | false>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

/** Fetch a PDF with auth and open, print or download it. */
export async function openPdf(path: string, mode: "view" | "print" | "download", filename: string) {
  const blob = await api<Blob>(path);
  const url = URL.createObjectURL(blob);
  if (mode === "download") {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else if (mode === "print") {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.src = url;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 60_000);
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
