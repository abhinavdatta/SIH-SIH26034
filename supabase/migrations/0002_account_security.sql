-- ═══════════════════════════════════════════════════════════════
-- LMCC account security (migration 0002)
--
-- Adds: per-user security settings (TOTP secret, security-question
-- hashes), password-reset tickets, and a password_changed_at column
-- used to invalidate sessions issued before a password reset.
--
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotent: safe to run more than once.
--
-- SECURITY: TOTP secrets live INSIDE the `data` jsonb wrapped in the
-- app's AES-256-GCM envelope (same scheme as account PII), so a DB
-- dump yields no usable TOTP secret. Question ANSWERS are stored only
-- as scrypt hashes. Reset tickets are stored hashed.
--
-- Repo: github.com/abhinavdatta
-- ═══════════════════════════════════════════════════════════════

-- Sessions issued before a password change are invalid.
alter table if exists public.lmcc_accounts
  add column if not exists password_changed_at timestamptz;

-- Per-user security settings blob (TOTP + security questions).
create table if not exists public.lmcc_security (
  user_id    text primary key references public.lmcc_accounts(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Password-reset tickets (short-lived; ticket id stored hashed).
create table if not exists public.lmcc_reset_tickets (
  ticket_hash text primary key,
  user_id     text not null references public.lmcc_accounts(id) on delete cascade,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists lmcc_reset_tickets_expiry_idx on public.lmcc_reset_tickets(expires_at);

-- Same deny-all posture as migration 0001: the app server (service key)
-- bypasses RLS; anon/authenticated can read nothing.
alter table if exists public.lmcc_security enable row level security;
alter table if exists public.lmcc_reset_tickets enable row level security;
