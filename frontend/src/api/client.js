// Fetch wrapper: base /api, Bearer attach, single-flight refresh on 401,
// {error:{code,message}} normalized into ApiError.
export class ApiError extends Error {
  constructor(code, message, status, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    // Structured extras the API sends inside the error object (e.g. the
    // free_slots list on a booking conflict) — pages rely on these.
    Object.assign(this, extra);
  }
}

export const getTokens = () => {
  try { return JSON.parse(localStorage.getItem('ragnosis_tokens') || 'null'); }
  catch { return null; }
};
export const setTokens = (t) => {
  if (t) localStorage.setItem('ragnosis_tokens', JSON.stringify(t));
  else localStorage.removeItem('ragnosis_tokens');
};

let refreshPromise = null;
async function doRefresh() {
  const t = getTokens();
  if (!t?.refresh) throw new ApiError('UNAUTHORIZED', 'Session expired. Please log in again.', 401);
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t.refresh }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setTokens(null);
    throw new ApiError(data.error?.code || 'UNAUTHORIZED', data.error?.message || 'Session expired.', res.status);
  }
  setTokens(data.tokens);
  return data.tokens.access;
}

// Paths that must never trigger a refresh attempt — they ARE the auth flow.
// (/auth/me is deliberately NOT here: it must refresh like any other call,
// otherwise every app reload after the 30-minute access token expires
// would silently log the user out.)
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh',
                    '/auth/forgot-password', '/auth/reset-password'];

export async function api(path, { method = 'GET', body, form, _retry = false } = {}) {
  const tokens = getTokens();
  const headers = {};
  if (tokens?.access) headers.Authorization = `Bearer ${tokens.access}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const res = await fetch('/api' + path, { method, headers, body: payload });

  if (res.status === 401 && !_retry && !NO_REFRESH.includes(path.split('?')[0])) {
    try {
      refreshPromise = refreshPromise || doRefresh();
      await refreshPromise;
      return api(path, { method, body, form, _retry: true });
    } catch (e) {
      // The session is over. Clear tokens and go to sign-in immediately so
      // other in-flight page requests don't cascade into header-less calls
      // that surface as "Missing or invalid token." toasts.
      setTokens(null);
      if (location.pathname !== '/login') location.assign('/login');
      throw e;
    } finally { refreshPromise = null; }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data.error?.code || 'INTERNAL_ERROR',
      data.error?.message || 'Something went wrong.',
      res.status,
      data.error || {},
    );
  }
  return data;
}
