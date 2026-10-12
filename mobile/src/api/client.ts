// API client — mirrors the web client: Bearer attach, tokens in
// SecureStore, single-flight refresh on 401, and the server's
// {error:{code,message}} shape normalized into ApiError.
// Uses fetch (no axios), per the web client's contract.
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../config';

export interface Tokens {
  access: string;
  refresh: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  mobile?: string | null;
  specialization?: string | null;
  hospital?: string | null;
  doctor_id_public?: string | null;
  linked_doctor_id?: string | null;
}

export interface ReportLabel {
  category: string;
  confidence: number;
}

export interface ReportListItem {
  id: string;
  file_name: string;
  category: string;
  labels?: ReportLabel[];
  health_score: number;
  health_band?: string;
  created_at: string;
  extraction_method?: string;
}

export interface Metric {
  param: string;
  value: number | string;
  unit: string;
  status: string;
}

export type CriticalFlag =
  | string
  | {
      param?: string;
      message?: string;
      detail?: string;
      value?: number | string;
      unit?: string;
      status?: string;
    };

export interface ReportValidation {
  status: string; // 'confirmed' | 'corrected' | anything else = not reviewed
  by_name?: string | null;
  at?: string | null;
}

export interface ReportDetailData extends ReportListItem {
  metrics: Metric[];
  summary?: string;
  critical_flags?: CriticalFlag[];
  validation?: ReportValidation | null;
}

export interface Doctor {
  id: string;
  name: string;
  specialization?: string;
  is_demo?: boolean;
}

export interface Slot {
  time: string;
  available: boolean;
}

export interface Appointment {
  id: string;
  doctor_id?: string;
  doctor_name?: string;
  date: string;
  slot: string;
  status: string;
  notes?: string | null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TOKEN_KEY = 'ragnosis_tokens';

export async function getTokens(): Promise<Tokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export async function setTokens(t: Tokens | null): Promise<void> {
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(t));
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Storage is best-effort — a failed write just means signing in again.
  }
}

let refreshPromise: Promise<string> | null = null;
let onUnauthorized: (() => void) | null = null;

/** The auth context registers here so a dead session drops the app to Login. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

async function doRefresh(): Promise<string> {
  const t = await getTokens();
  if (!t?.refresh) {
    throw new ApiError('UNAUTHORIZED', 'Session expired. Please log in again.', 401);
  }
  const res = await fetch(API_BASE + '/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t.refresh }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    tokens?: Tokens;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !data.tokens) {
    await setTokens(null);
    throw new ApiError(
      data.error?.code || 'UNAUTHORIZED',
      data.error?.message || 'Session expired.',
      res.status,
    );
  }
  await setTokens(data.tokens);
  return data.tokens.access;
}

// Paths that must never trigger a refresh attempt — they ARE the auth flow.
// (/auth/me is deliberately NOT here: it must refresh like any other call,
// otherwise every app relaunch after the access token expires would
// silently log the user out.)
const NO_REFRESH = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

interface ApiOptions {
  method?: string;
  body?: unknown;
  _retry?: boolean;
}

export async function api<T>(
  path: string,
  { method = 'GET', body, _retry = false }: ApiOptions = {},
): Promise<T> {
  const tokens = await getTokens();
  const headers: Record<string, string> = {};
  if (tokens?.access) headers.Authorization = `Bearer ${tokens.access}`;
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(API_BASE + path, { method, headers, body: payload });

  if (res.status === 401 && !_retry && !NO_REFRESH.includes(path.split('?')[0])) {
    try {
      refreshPromise = refreshPromise ?? doRefresh();
      await refreshPromise;
      return api<T>(path, { method, body, _retry: true });
    } catch (e) {
      // The session is over: clear tokens and let the auth context drop
      // the app back to the sign-in screen.
      await setTokens(null);
      if (onUnauthorized) onUnauthorized();
      throw e;
    } finally {
      refreshPromise = null;
    }
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new ApiError(
      data.error?.code || 'INTERNAL_ERROR',
      data.error?.message || 'Something went wrong.',
      res.status,
    );
  }
  return data as T;
}
