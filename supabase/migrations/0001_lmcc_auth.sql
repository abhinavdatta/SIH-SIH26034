-- ═══════════════════════════════════════════════════════════════
-- LMCC auth + data schema (Supabase Postgres)
--
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotent: safe to run more than once.
--
-- SECURITY MODEL (matches src/lib/server/auth-store.ts):
--   - password_hash  = scrypt(client PBKDF2 verifier) — raw passwords
--     never reach the server; DB leak alone cannot be replayed
--   - pii            = AES-256-GCM envelope (key from AUTH_PEPPER);
--     a DB dump without the env secret reveals no name/email/employee ID
--   - email_index    = HMAC-SHA256(email, pepper) — no plaintext email at rest
--   - invite codes   = OFFICER_INVITE_CODES env (validated in app, not here)
--
-- The app talks to Postgres DIRECTLY (server-side only, over TLS with the
-- service connection string) — no anon/client-side access, so RLS is not
-- relied upon; the service role bypasses it. public.* exposure via the
-- Data API stays restricted by RLS = deny-all below.
--
-- Repo: github.com/abhinavdatta
-- ═══════════════════════════════════════════════════════════════

-- ── Lock down Data API access (app uses direct DB connection) ──
alter table if exists public.lmcc_accounts enable row level security;
alter table if exists public.lmcc_sessions enable row level security;
alter table if exists public.lmcc_user_scans enable row level security;
alter table if exists public.lmcc_rate_limits enable row level security;

-- ── Accounts ──
create table if not exists public.lmcc_accounts (
  id           text primary key,
  email_index  text not null unique,        -- HMAC(email), never the email itself
  pii          text not null,               -- AES-256-GCM envelope: {name,email,employeeId}
  role         text not null check (role in ('seller', 'compliance_officer')),
  password_hash text not null,              -- s1$salt$scrypt(clientVerifier)
  created_at   timestamptz not null default now()
);

-- ── Sessions (opaque 256-bit token id; TTL enforced by app + cron-able cleanup) ──
create table if not exists public.lmcc_sessions (
  token_hash  text primary key,             -- sha256(token) — a stolen DB dump can't resurrect cookies
  user_id     text not null references public.lmcc_accounts(id) on delete cascade,
  role        text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists lmcc_sessions_user_idx on public.lmcc_sessions(user_id);
create index if not exists lmcc_sessions_expiry_idx on public.lmcc_sessions(expires_at);

-- ── Per-account scan snapshots (cross-device sync) ──
create table if not exists public.lmcc_user_scans (
  user_id     text primary key references public.lmcc_accounts(id) on delete cascade,
  scans       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Durable fixed-window rate-limit counters (shared across instances) ──
create table if not exists public.lmcc_rate_limits (
  key        text primary key,
  count      integer not null default 0,
  window_start timestamptz not null default now()
);

-- Atomic increment + window reset + over-limit verdict in ONE statement
-- (no read-modify-write race between server instances).
-- SECURITY: executable by service_role only — revoke from anon/authenticated.
create or replace function public.lmcc_hit_rate_limit(
  p_key text,
  p_window_secs integer,
  p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lmcc_rate_limits;
  v_now timestamptz := now();
  v_cutoff timestamptz := now() - make_interval(secs => p_window_secs);
begin
  insert into public.lmcc_rate_limits (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
    set count = case
          when public.lmcc_rate_limits.window_start < v_cutoff then 1
          else public.lmcc_rate_limits.count + 1
        end,
        window_start = case
          when public.lmcc_rate_limits.window_start < v_cutoff then v_now
          else public.lmcc_rate_limits.window_start
        end
  returning * into v_row;

  return v_row.count > p_max;
end;
$$;

revoke execute on function public.lmcc_hit_rate_limit(text, integer, integer) from anon, authenticated;

-- ── Cleanup helper: run occasionally (or via pg_cron if enabled) ──
create or replace function public.lmcc_cleanup_expired()
returns void language plpgsql as $$
begin
  delete from public.lmcc_sessions where expires_at < now();
  delete from public.lmcc_rate_limits where window_start < now() - interval '1 hour';
end;
$$;
