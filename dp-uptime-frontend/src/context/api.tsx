// src/context/api.ts
/**
 * Small helper that does JSON fetch and attaches Authorization Bearer token when provided.
 * Contexts / callers should call getToken() themselves and pass the token into this helper.
 *
 * Notes:
 * - Do NOT import RequestInit from "node-fetch" in frontend code — the DOM's RequestInit is used here.
 * - Content-Type is only set automatically when a body is present and it is NOT a FormData instance.
 */

export async function apiFetch<T = any>(
  input: string,
  opts: RequestInit = {},
  token?: string | null
): Promise<{ status: number; data?: T; error?: any }> {
  // normalize incoming headers (could be Headers, Record<string,string> or undefined)
  const headers: Record<string, string> = { Accept: "application/json" };

  if (opts.headers instanceof Headers) {
    opts.headers.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (opts.headers && typeof opts.headers === "object") {
    Object.assign(headers, opts.headers as Record<string, string>);
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // set Content-Type only when there is a body and it's not FormData (so file uploads still work)
  const hasBody = opts.body !== undefined && opts.body !== null && !(opts.body instanceof FormData);
  if (hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const finalOpts: RequestInit = {
    ...opts,
    headers,
    // include cookies by default — adjust if your API doesn't need this
    credentials: "include",
  };

  try {
    const res = await fetch(input, finalOpts);
    const status = res.status;

    // Try to parse JSON safely. Some endpoints may return empty body or non-JSON.
    let data: any = undefined;
    try {
      // reading text first avoids throwing on empty responses
      const text = await res.text();
      if (text) {
        data = JSON.parse(text);
      }
    } catch {
      data = undefined;
    }

    if (!res.ok) {
      return { status, error: data ?? { message: res.statusText } };
    }

    return { status, data };
  } catch (err) {
    // network / CORS / unexpected failure
    return { status: 0, error: err };
  }
}
