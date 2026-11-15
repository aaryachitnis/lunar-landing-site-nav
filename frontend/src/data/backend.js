// In dev, Vite proxies /api to http://127.0.0.1:8000. In production set VITE_API_BASE.

export const API_BASE = (import.meta.env?.VITE_API_BASE ?? '/api').replace(/\/$/, '');

export class BackendError extends Error {}

export async function fetchJson(path, params, options) {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  let res;
  try {
    res = await fetch(`${API_BASE}${path}${query}`, options);
  } catch {
    throw new BackendError(`Can't reach the backend at ${API_BASE}. Is it running?`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // A proxy error (backend not started) comes back as a non-JSON 5xx.
    if (!body) throw new BackendError(`Can't reach the backend at ${API_BASE}. Is it running?`);
    throw new BackendError(typeof body.detail === 'string' ? body.detail : `Backend error ${res.status}`);
  }
  return body;
}

export function postJson(path, body) {
  return fetchJson(path, null, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
