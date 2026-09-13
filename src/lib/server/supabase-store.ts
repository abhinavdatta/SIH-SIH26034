// ═══════════════════════════════════════════════════════════════
// Supabase Postgres store — server-only credential/data layer.
//
// Durable backend for accounts/sessions/scans: real relational DB,
// TLS by default, survives everything, Vercel-friendly (no ephemeral
// filesystem needed).
//
// IMPLEMENTATION: plain fetch against Supabase's PostgREST Data API
// with the SERVICE_ROLE key — zero extra npm dependencies. The service
// key bypasses RLS, so this module must NEVER be imported from client
// code ('server-only' enforces that). The anon key cannot read
// anything: every table has RLS enabled with no policies (deny-all).
//
// Schema: supabase/migrations/0001_lmcc_auth.sql (paste once into the
// Supabase SQL editor).
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import 'server-only';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

export const isSupabaseBackend = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

const REST = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;
const HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${REST}${path}`, { ...init, headers: { ...HEADERS, ...(init?.headers ?? {}) }, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase REST ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

/* ── Rows (mirror of supabase/migrations/0001_lmcc_auth.sql) ── */

interface AccountRow {
  id: string;
  email_index: string;
  pii: string;
  role: 'seller' | 'compliance_officer';
  password_hash: string;
  created_at?: string;
}

export interface StoredAccount {
  id: string;
  emailIndex: string;
  pii: string;
  role: 'seller' | 'compliance_officer';
  passwordHash: string;
  createdAt: string;
}

function rowToAccount(r: AccountRow): StoredAccount {
  return {
    id: r.id,
    emailIndex: r.email_index,
    pii: r.pii,
    role: r.role,
    passwordHash: r.password_hash,
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

/* ── Accounts ── */

export async function sbGetAccountByEmailIndex(emailIndex: string): Promise<StoredAccount | null> {
  const rows = await rest<AccountRow[]>(
    `/lmcc_accounts?select=*&&email_index=eq.${encodeURIComponent(emailIndex)}&limit=1`
  );
  return rows && rows.length > 0 ? rowToAccount(rows[0]) : null;
}

export async function sbSaveAccount(account: StoredAccount): Promise<void> {
  const row: AccountRow = {
    id: account.id,
    email_index: account.emailIndex,
    pii: account.pii,
    role: account.role,
    password_hash: account.passwordHash,
  };
  await rest('/lmcc_accounts', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
}

export async function sbGetAccountById(userId: string): Promise<StoredAccount | null> {
  const rows = await rest<AccountRow[]>(`/lmcc_accounts?select=*&id=eq.${encodeURIComponent(userId)}&limit=1`);
  return rows && rows.length > 0 ? rowToAccount(rows[0]) : null;
}

/* ── Sessions (token stored as sha256 hash — see route for derivation) ── */

interface SessionRow {
  token_hash: string;
  user_id: string;
  role: 'seller' | 'compliance_officer';
  created_at?: string;
  expires_at: string;
}

export interface StoredSession {
  userId: string;
  role: 'seller' | 'compliance_officer';
  createdAt: string;
  expiresAt: string;
}

export async function sbSaveSession(tokenHash: string, session: StoredSession): Promise<void> {
  await rest('/lmcc_sessions', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      token_hash: tokenHash,
      user_id: session.userId,
      role: session.role,
      expires_at: session.expiresAt,
    }),
  });
}

export async function sbGetSession(tokenHash: string): Promise<StoredSession | null> {
  const rows = await rest<SessionRow[]>(`/lmcc_sessions?select=*&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`);
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    userId: r.user_id,
    role: r.role,
    createdAt: r.created_at ?? new Date().toISOString(),
    expiresAt: r.expires_at,
  };
}

export async function sbDeleteSession(tokenHash: string): Promise<void> {
  await rest(`/lmcc_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, { method: 'DELETE' });
}

/* ── Per-account scan snapshots ── */

interface ScansRow {
  user_id: string;
  scans: string; // jsonb arrives as parsed JSON via PostgREST
  updated_at?: string;
}

export async function sbGetUserScans(userId: string): Promise<string | null> {
  const rows = await rest<ScansRow[]>(`/lmcc_user_scans?select=scans&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  if (!rows || rows.length === 0) return null;
  const scans = rows[0].scans;
  return typeof scans === 'string' ? scans : JSON.stringify(scans);
}

export async function sbSaveUserScans(userId: string, scansJson: string): Promise<void> {
  // Upsert on primary key (user_id)
  await rest('/lmcc_user_scans', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, scans: JSON.parse(scansJson) }),
  });
}

/* ── Durable fixed-window rate limiting ──

   Atomicity lives in Postgres: migration 0001 defines
   lmcc_hit_rate_limit(key, window_secs, max) which increments and
   returns whether the caller is over the limit in ONE statement — no
   read-modify-write race between server instances. */

export async function sbHitRateLimit(key: string, windowMs: number, max: number): Promise<boolean> {
  const result = await rest<boolean>('/rpc/lmcc_hit_rate_limit', {
    method: 'POST',
    body: JSON.stringify({ p_key: key, p_window_secs: Math.max(1, Math.ceil(windowMs / 1000)), p_max: max }),
  });
  return result === true;
}

export async function sbResetRateLimit(key: string): Promise<void> {
  await rest(`/lmcc_rate_limits?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
}
