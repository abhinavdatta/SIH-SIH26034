-- ═══════════════════════════════════════════════════════════════
-- 0003_default_ai_provider.sql — server-held built-in default AI provider.
--
-- Lets AI/hybrid OCR work for every signed-in user without a personal
-- API key. Only ONE model is provisioned this way
-- (meta/llama-3.2-11b-vision-instruct); every other model stays
-- bring-your-own-key. The API key never ships to browsers: it is
-- AES-256-GCM encrypted by the server on first read and stored here as
-- an opaque envelope — consistent with the app's no-plaintext guardrail.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.lmcc_settings (
  name text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Deny-all: only the service role (used by the app's server code) may
-- read or write this table.
alter table if exists public.lmcc_settings enable row level security;
