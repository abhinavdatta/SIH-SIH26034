// ═══════════════════════════════════════════════════════════════
// Server-side credential & data store (API routes only — never
// imported from client components).
//
// BACKENDS (priority order)
//  1. Supabase Postgres — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//     (+ schema from supabase/migrations/0001_lmcc_auth.sql). Real
//     relational store; recommended production backend.
//  2. Upstash Redis (REST) — UPSTASH_REDIS_REST_URL + TOKEN, or the
//     Vercel Marketplace KV aliases (KV_REST_API_URL/TOKEN).
//  3. Durable local file (.data/auth-kv.json) on non-serverless hosts.
//  4. In-memory Map (last resort — survives only within one process).
//
// NEVER-PLAINTEXT GUARANTEES (identical on every backend)
//  - passwordVerifier: PBKDF2-SHA256(150k) derived on the CLIENT from
//    the raw password — the raw password never reaches the server.
//    Re-hashed server-side with scrypt before storage (defense in depth:
//    a DB leak alone cannot be replayed as a login).
//  - PII (name, email, employeeId): AES-256-GCM encrypted with a key
//    derived from AUTH_PEPPER (server secret). A database dump without
//    the env secret reveals no user PII. Lookup by HMAC-SHA256(email).
//  - Session cookies are stored hashed (sha256) on SQL backends.
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import 'server-only';
import { scryptSync, randomBytes, createHmac, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  isSupabaseBackend,
  sbGetAccountByEmailIndex,
  sbSaveAccount,
  sbGetAccountById,
  sbSaveSession,
  sbGetSession,
  sbDeleteSession,
  sbGetUserScans,
  sbSaveUserScans,
  sbHitRateLimit,
  sbResetRateLimit,
  type StoredAccount,
} from './supabase-store';

/* ── Backend selection ──

   1. Supabase Postgres  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
   2. Upstash / Vercel KV (UPSTASH_* or KV_* REST vars)
   3. Durable local file (.data/auth-kv.json) on non-serverless hosts
   4. In-memory Map (last resort — survives only within one process) */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const isRedisBackend = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

/** True when a durable backend is active (Supabase, Redis/KV, or file). */
export const isPersistentBackend = isSupabaseBackend || isRedisBackend;

/** Human-readable backend name for status surfaces. */
export function backendName(): 'supabase' | 'redis' | 'file' | 'memory' {
  if (isSupabaseBackend) return 'supabase';
  if (isRedisBackend) return 'redis';
  return FILE_BACKEND_ENABLED ? 'file' : 'memory';
}

async function redisCommand<T = unknown>(command: (string | number)[]): Promise<T | null> {
  if (!isPersistentBackend) return null;
  const res = await fetch(`${UPSTASH_URL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const json = (await res.json()) as { result: T };
  return json.result;
}

/* ── In-memory fallback (last resort) ── */

const memory = new Map<string, string>();
async function memoryGet(key: string): Promise<string | null> {
  return memory.get(key) ?? null;
}
async function memorySet(key: string, value: string): Promise<void> {
  memory.set(key, value);
}
async function memoryDel(key: string): Promise<void> {
  memory.delete(key);
}

/* ── File-backed fallback (durable across server restarts) ──

   When Upstash isn't configured, accounts/sessions/scans persist to
   .data/auth-kv.json on the server machine. This fixes the "login is
   forgotten on refresh/restart" problem for local dev and any
   self-hosted Node deployment WITHOUT any env setup.

   Disabled on Vercel (serverless filesystems are ephemeral/read-only)
   — there, real durability requires UPSTASH_* env vars. */

const FILE_BACKEND_ENABLED = !process.env.VERCEL;
/** True when accounts survive a server restart (Redis OR file-backed). */
export const isDurableBackend = isPersistentBackend || FILE_BACKEND_ENABLED;

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'auth-kv.json');

let fileCache: Record<string, string> | null = null;
let flushScheduled = false;

function loadFileCache(): Record<string, string> {
  if (fileCache) return fileCache;
  fileCache = {};
  try {
    fileCache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Record<string, string>;
  } catch {
    // First run or unreadable file → start empty; memory stays authoritative.
  }
  return fileCache;
}

/** Drop expired session and rate-limit entries so the file doesn't grow forever. */
function purgeExpiredEntries(map: Record<string, string>): void {
  const now = Date.now();
  for (const key of Object.keys(map)) {
    if (key.startsWith('lmcc:sess:')) {
      try {
        const session = JSON.parse(map[key]) as { expiresAt: string };
        if (new Date(session.expiresAt).getTime() < now) delete map[key];
      } catch {
        delete map[key];
      }
    } else if (key.startsWith(RATE_LIMIT_PREFIX)) {
      try {
        const entry = JSON.parse(map[key]) as { firstAt: number };
        // Windows are ≤ 10 min in this app; anything older is dead weight.
        if (now - entry.firstAt > 60 * 60 * 1000) delete map[key];
      } catch {
        delete map[key];
      }
    }
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(loadFileCache()));
      fs.renameSync(tmp, DATA_FILE); // atomic swap
    } catch {
      // Read-only FS (e.g. some hosts) → memory still works for this instance.
    }
  }, 25);
}

/* ── Generic KV ops ── */

async function kvGet(key: string): Promise<string | null> {
  if (isPersistentBackend) {
    const v = await redisCommand<string>(['GET', key]);
    return v ?? null;
  }
  if (FILE_BACKEND_ENABLED) {
    const map = loadFileCache();
    purgeExpiredEntries(map);
    if (key in map) return map[key];
  }
  return memoryGet(key);
}

async function kvSet(key: string, value: string): Promise<void> {
  if (isPersistentBackend) {
    await redisCommand(['SET', key, value]);
    return;
  }
  if (FILE_BACKEND_ENABLED) {
    loadFileCache()[key] = value;
    scheduleFlush();
  }
  await memorySet(key, value);
}

async function kvDel(key: string): Promise<void> {
  if (isPersistentBackend) {
    await redisCommand(['DEL', key]);
    return;
  }
  if (FILE_BACKEND_ENABLED) {
    delete loadFileCache()[key];
    scheduleFlush();
  }
  await memoryDel(key);
}

/* ── Helpers ── */

function sha256b64url(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

/* ── Secrets ── */

let cachedPepper: Buffer | null = null;

/** Where the pepper comes from — the auth route uses this to fail closed
    when nothing durable exists (serverless without AUTH_PEPPER). */
export function pepperSource(): 'env' | 'file' | 'none' {
  if (process.env.AUTH_PEPPER && process.env.AUTH_PEPPER.length >= 16) return 'env';
  return FILE_BACKEND_ENABLED ? 'file' : 'none';
}

/**
 * Pepper used for AES-GCM PII encryption + HMAC email indexes.
 * Priority: AUTH_PEPPER env → persisted auto-generated secret (.data/pepper.secret)
 * → dev fallback constant. Cached per process. The generated file keeps PII
 * decryptable across restarts when no env is configured; env is still the
 * recommended production setup (see .env.example).
 */
function getPepper(): Buffer {
  if (cachedPepper) return cachedPepper;
  const source = pepperSource();
  if (source === 'env') {
    cachedPepper = createHash('sha256').update(process.env.AUTH_PEPPER!).digest(); // 32 bytes
    return cachedPepper;
  }
  if (source === 'file') {
    try {
      const secretFile = path.join(DATA_DIR, 'pepper.secret');
      let secret = '';
      try {
        secret = fs.readFileSync(secretFile, 'utf8').trim();
      } catch {
        // First boot — generate below.
      }
      if (secret.length < 32) {
        secret = randomBytes(32).toString('hex');
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(secretFile, secret, { mode: 0o600 });
        console.warn(
          '[LMCC auth] AUTH_PEPPER not set — generated a server secret at .data/pepper.secret. ' +
            'Set AUTH_PEPPER in the environment for real deployments (see .env.example).'
        );
      }
      cachedPepper = createHash('sha256').update(secret).digest();
      return cachedPepper;
    } catch {
      // Read-only FS → fall through to dev constant (memory still works).
    }
  }
  // Dev-only deterministic key so local flows work without env setup.
  // Deployments without AUTH_PEPPER and without a writable FS fail closed
  // (checked in the auth route).
  cachedPepper = createHash('sha256').update('lmcc-dev-pepper-do-not-use-in-prod').digest();
  return cachedPepper;
}

/* ── PII envelope encryption (AES-256-GCM) ── */

export function encryptPII(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getPepper(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${enc.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptPII(envelope: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', getPepper(), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[3], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Deterministic, non-reversible email lookup key (HMAC with server secret). */
export function emailLookupKey(email: string): string {
  return createHmac('sha256', getPepper()).update(email.trim().toLowerCase()).digest('hex');
}

/* ── Server-side verifier hashing (scrypt over the client-derived value) ── */

export function hashVerifier(clientVerifier: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt ?? randomBytes(16).toString('hex');
  const hash = scryptSync(clientVerifier, useSalt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { hash: `s1$${useSalt}$${hash}`, salt: useSalt };
}

export function verifyVerifier(clientVerifier: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 's1') return false;
  const [, salt, storedHash] = parts;
  // Recompute ONLY the digest (hashVerifier's return includes the
  // s1$salt$ prefix — comparing that whole string against storedHash
  // could never match, which made every login fail). Same params as
  // hashVerifier is what guarantees an apples-to-apples digest.
  const recomputed = scryptSync(clientVerifier, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  const a = Buffer.from(recomputed);
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── Records ── */

export type { StoredAccount } from './supabase-store';

export function accountKey(emailIndex: string): string {
  return `lmcc:acct:${emailIndex}`;
}

export async function getAccount(email: string): Promise<StoredAccount | null> {
  const idx = emailLookupKey(email);
  if (isSupabaseBackend) return sbGetAccountByEmailIndex(idx);
  const raw = await kvGet(accountKey(idx));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAccount;
  } catch {
    return null;
  }
}

export async function saveAccount(account: StoredAccount): Promise<void> {
  if (isSupabaseBackend) {
    await sbSaveAccount(account);
    return;
  }
  await kvSet(accountKey(account.emailIndex), JSON.stringify(account));
}

/* ── Sessions (server-side, opaque token in an httpOnly cookie) ── */

export interface ServerSession {
  userId: string;
  role: 'seller' | 'compliance_officer';
  createdAt: string;
  expiresAt: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function saveSession(token: string, session: ServerSession): Promise<void> {
  if (isSupabaseBackend) {
    // Token is stored HASHED — a DB dump cannot resurrect session cookies.
    await sbSaveSession(sha256b64url(token), {
      userId: session.userId,
      role: session.role,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });
    return;
  }
  const ttlSec = Math.floor(SESSION_TTL_MS / 1000);
  if (isRedisBackend) {
    // Single SET with EX — atomic, no TTL race between SET and EXPIRE.
    await redisCommand(['SET', `lmcc:sess:${token}`, JSON.stringify(session), 'EX', ttlSec]);
    return;
  }
  await kvSet(`lmcc:sess:${token}`, JSON.stringify(session));
}

export async function getSessionByToken(token: string): Promise<ServerSession | null> {
  if (isSupabaseBackend) {
    const stored = await sbGetSession(sha256b64url(token));
    if (!stored) return null;
    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      await sbDeleteSession(sha256b64url(token));
      return null;
    }
    return stored;
  }
  const raw = await kvGet(`lmcc:sess:${token}`);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as ServerSession;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await kvDel(`lmcc:sess:${token}`);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function deleteSession(token: string): Promise<void> {
  if (isSupabaseBackend) {
    await sbDeleteSession(sha256b64url(token));
    return;
  }
  await kvDel(`lmcc:sess:${token}`);
}

/** Load the PII envelope for a session's user (for export stamps). */
export async function getAccountById(userId: string): Promise<StoredAccount | null> {
  if (isSupabaseBackend) return sbGetAccountById(userId);
  // Redis/file: sessions store the emailIndex indirectly via an id index.
  const raw = await kvGet(`lmcc:uid:${userId}`);
  if (!raw) return null;
  const account = await kvGet(accountKey(raw));
  if (!account) return null;
  try {
    return JSON.parse(account) as StoredAccount;
  } catch {
    return null;
  }
}

export async function indexUserId(userId: string, emailIndex: string): Promise<void> {
  // SQL backends look accounts up by id directly; the id→emailIndex map
  // is only needed by the KV-style backends.
  if (isSupabaseBackend) return;
  await kvSet(`lmcc:uid:${userId}`, emailIndex);
}

/* ── Rate limiting (durable when a backend exists) ──

   Fixed-window counters shared across ALL server instances when Redis/KV
   or the file backend is active; per-instance memory only as a documented
   last resort (serverless without a configured store). */

export type RateLimitMode = 'supabase' | 'redis' | 'file' | 'memory';

export function rateLimitMode(): RateLimitMode {
  if (isSupabaseBackend) return 'supabase';
  if (isRedisBackend) return 'redis';
  return FILE_BACKEND_ENABLED ? 'file' : 'memory';
}

const RATE_LIMIT_PREFIX = 'lmcc:rl:';

/** Returns true when the caller has EXCEEDED max attempts in the window. */
export async function hitRateLimit(key: string, windowMs: number, max: number): Promise<boolean> {
  const rlKey = `${RATE_LIMIT_PREFIX}${key}`;

  if (isSupabaseBackend) {
    // Atomic RPC in Postgres — single statement, no cross-instance race.
    return sbHitRateLimit(rlKey, windowMs, max);
  }

  if (isRedisBackend) {
    // Atomic INCR + first-write EXPIRE — true cross-instance counting.
    const count = await redisCommand<number>(['INCR', rlKey]);
    if (count === 1) {
      await redisCommand(['EXPIRE', rlKey, Math.max(1, Math.ceil(windowMs / 1000))]);
    }
    return (count ?? 1) > max;
  }

  // File/memory counters: same fixed-window semantics as before, but
  // persisted via the kv layer so restarts don't wipe them.
  const raw = await kvGet(rlKey);
  const now = Date.now();
  let entry: { count: number; firstAt: number } | null = null;
  if (raw) {
    try {
      entry = JSON.parse(raw) as { count: number; firstAt: number };
    } catch {
      entry = null;
    }
  }
  if (!entry || now - entry.firstAt > windowMs) {
    entry = { count: 1, firstAt: now };
  } else {
    entry.count += 1;
  }
  await kvSet(rlKey, JSON.stringify(entry));
  return entry.count > max;
}

export async function resetRateLimit(key: string): Promise<void> {
  await resetRateLimitBackend(`${RATE_LIMIT_PREFIX}${key}`);
}

async function resetRateLimitBackend(rlKey: string): Promise<void> {
  if (isSupabaseBackend) {
    await sbResetRateLimit(rlKey);
    return;
  }
  await kvDel(rlKey);
}

/* ── Scan storage (cross-device) ── */

export async function saveUserScans(userId: string, scansJson: string): Promise<void> {
  if (isSupabaseBackend) {
    await sbSaveUserScans(userId, scansJson);
    return;
  }
  await kvSet(`lmcc:scans:${userId}`, scansJson);
}

export async function getUserScans(userId: string): Promise<string | null> {
  if (isSupabaseBackend) return sbGetUserScans(userId);
  return kvGet(`lmcc:scans:${userId}`);
}
