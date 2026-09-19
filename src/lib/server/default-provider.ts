// ═══════════════════════════════════════════════════════════════
// Built-in default AI provider — server-side only.
//
// Exactly ONE model is provisioned for all users:
//   meta/llama-3.2-11b-vision-instruct (NVIDIA NIM)
// The key is resolved in priority order:
//   1. lmcc_settings row 'default_ai_provider' in Supabase (durable,
//      shared across deployments). If present but stored as plaintext
//      `key`, it is encrypted in place on first read (encrypt-on-first-
//      read) and only the envelope is ever kept afterwards.
//   2. DEFAULT_AI_PROVIDER_KEY env var (local dev / fallback).
// The resolved key never leaves the server: the client learns only
// that a built-in provider exists, not its key.
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import 'server-only';
import { encryptPII, decryptPII } from './auth-store';
import { isSupabaseBackend, sbGetSetting, sbUpsertSetting } from './supabase-store';

export const DEFAULT_PROVIDER_SETTING = 'default_ai_provider';

export interface DefaultProvider {
  apiUrl: string;
  model: string;
  apiKey: string;
  category: 'nvidia';
  /** Where the key came from — surfaced in the GET status endpoint. */
  source: 'supabase' | 'env';
}

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'meta/llama-3.2-11b-vision-instruct';

interface SettingBlob {
  apiUrl?: string;
  model?: string;
  /** AES-GCM envelope (preferred) or raw key on very first read. */
  keyEnvelope?: string;
}

function envelopeLooksEncrypted(v: string): boolean {
  // encryptPII format: "v1:<iv>:<tag>:<ciphertext>" (base64url parts).
  return /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(v);
}

/* ── Cache: avoid a Supabase round-trip per scan ── */
let cache: { provider: DefaultProvider | null; at: number } | null = null;
const CACHE_MS = 60_000;

function fromEnv(): DefaultProvider | null {
  const key = process.env.DEFAULT_AI_PROVIDER_KEY?.trim();
  if (!key) return null;
  return { apiUrl: NVIDIA_URL, model: NVIDIA_MODEL, apiKey: key, category: 'nvidia', source: 'env' };
}

/**
 * Resolve the built-in provider, or null when none is configured.
 * Never throws — a failed Supabase read just means "no default".
 */
export async function getDefaultProvider(): Promise<DefaultProvider | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.provider;

  let resolved: DefaultProvider | null = null;

  if (isSupabaseBackend) {
    try {
      const blob = (await sbGetSetting(DEFAULT_PROVIDER_SETTING)) as SettingBlob | null;
      const stored = blob?.keyEnvelope?.trim();

      if (blob?.apiUrl && blob?.model && stored) {
        let key: string | null = null;

        if (envelopeLooksEncrypted(stored)) {
          try {
            key = decryptPII(stored);
          } catch {
            // Wrong/rotated pepper — treat as unconfigured rather than 500s.
            console.error('[default-provider] Stored key envelope failed to decrypt (pepper changed?).');
            key = null;
          }
        } else {
          // Plaintext seed (e.g. pasted via SQL editor): encrypt in place ONCE.
          key = stored;
          try {
            await sbUpsertSetting(DEFAULT_PROVIDER_SETTING, {
              apiUrl: blob.apiUrl,
              model: blob.model,
              keyEnvelope: encryptPII(key),
            });
            console.log('[default-provider] Plaintext seed encrypted in place (v1 envelope stored).');
          } catch (e) {
            // Non-fatal: keep using the plaintext value this request.
            console.warn('[default-provider] Could not re-encrypt seed:', e instanceof Error ? e.message : e);
          }
        }

        if (key) {
          resolved = { apiUrl: blob.apiUrl!, model: blob.model!, apiKey: key, category: 'nvidia', source: 'supabase' };
        }
      }
    } catch (e) {
      // Table may not exist yet (migration 0003 not run) — fall through.
      console.warn('[default-provider] Supabase settings read failed:', e instanceof Error ? e.message : e);
    }
  }

  if (!resolved) resolved = fromEnv();
  cache = { provider: resolved, at: Date.now() };
  return resolved;
}

/** Whether any built-in default is configured (used by GET status). */
export async function hasDefaultProvider(): Promise<boolean> {
  if (!isSupabaseBackend && !process.env.DEFAULT_AI_PROVIDER_KEY) return false;
  return (await getDefaultProvider()) !== null;
}

/** Used by the status endpoint to distinguish durable vs ephemeral setups. */
export function defaultProviderIsDurable(): boolean {
  return isSupabaseBackend;
}
