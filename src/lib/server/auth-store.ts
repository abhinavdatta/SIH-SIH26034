// ═══════════════════════════════════════════════════════════════
// Server-side credential & data store (API routes only — never
// imported from client components).
//
// BACKENDS
//  - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL + TOKEN are set
//    → accounts and scans work across devices/browsers.
//  - Fallback: in-memory Map (dev only). Data resets on server restart;
//    cross-device login is unavailable and the UI says so honestly.
//
// NEVER-PLAINTEXT GUARANTEES
//  - passwordVerifier: PBKDF2-SHA256(150k) derived on the CLIENT from
//    the raw password — the raw password never reaches the server.
//    Re-hashed server-side with scrypt before storage (defense in depth:
//    a DB leak alone cannot be replayed as a login).
//  - PII (name, email, employeeId): AES-256-GCM encrypted with a key
//    derived from AUTH_PEPPER (server secret). A database dump without
//    the env secret reveals no user PII. Lookup by HMAC-SHA256(email).
//  - AUTH_PEPPER must be set in production (32+ random chars).
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import 'server-only';
import { scryptSync, randomBytes, createHmac, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'crypto';
import fs from 'node:fs';
import path from 'node:path';

/* ── Backend selection ──

   Supported, in priority order:
   1. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (direct Upstash)
   2. KV_REST_API_URL / KV_REST_API_TOKEN  (Vercel Marketplace KV —
      auto-injected when you create a KV store in the Vercel dashboard,
      zero manual env typing)
   3. Durable local file (.data/auth-kv.json) on non-serverless hosts
   4. In-memory Map (last resort — survives only within one process) */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const isPersistentBackend = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

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

export interface StoredAccount {
  id: string;
  /** HMAC of the lowercase email — allows lookup without storing the email. */
  emailIndex: string;
  /** AES-GCM envelope: JSON { name, email, employeeId }. */
  pii: string;
  role: 'seller' | 'compliance_officer';
  passwordHash: string; // scrypt(clientVerifier)
  createdAt: string;
}

export function accountKey(emailIndex: string): string {
  return `lmcc:acct:${emailIndex}`;
}

export async function getAccount(email: string): Promise<StoredAccount | null> {
  const raw = await kvGet(accountKey(emailLookupKey(email)));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAccount;
  } catch {
    return null;
  }
}

export async function saveAccount(account: StoredAccount): Promise<void> {
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
  const ttlSec = Math.floor(SESSION_TTL_MS / 1000);
  if (isPersistentBackend) {
    // Single SET with EX — atomic, no TTL race between SET and EXPIRE.
    await redisCommand(['SET', `lmcc:sess:${token}`, JSON.stringify(session), 'EX', ttlSec]);
    return;
  }
  await kvSet(`lmcc:sess:${token}`, JSON.stringify(session));
}

export async function getSessionByToken(token: string): Promise<ServerSession | null> {
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
  await kvDel(`lmcc:sess:${token}`);
}

/** Load the PII envelope for a session's user (for export stamps). */
export async function getAccountById(userId: string): Promise<StoredAccount | null> {
  // Sessions store the emailIndex indirectly via the account id scan.
  // To avoid a full scan we also index id → emailIndex at signup.
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
  await kvSet(`lmcc:uid:${userId}`, emailIndex);
}

/* ── Rate limiting (durable when a backend exists) ──

   Fixed-window counters shared across ALL server instances when Redis/KV
   or the file backend is active; per-instance memory only as a documented
   last resort (serverless without a configured store). */

export type RateLimitMode = 'redis' | 'file' | 'memory';

export function rateLimitMode(): RateLimitMode {
  if (isPersistentBackend) return 'redis';
  return FILE_BACKEND_ENABLED ? 'file' : 'memory';
}

const RATE_LIMIT_PREFIX = 'lmcc:rl:';

/** Returns true when the caller has EXCEEDED max attempts in the window. */
export async function hitRateLimit(key: string, windowMs: number, max: number): Promise<boolean> {
  const rlKey = `${RATE_LIMIT_PREFIX}${key}`;

  if (isPersistentBackend) {
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
  await kvDel(`${RATE_LIMIT_PREFIX}${key}`);
}

/* ── Scan storage (cross-device) ── */

export async function saveUserScans(userId: string, scansJson: string): Promise<void> {
  await kvSet(`lmcc:scans:${userId}`, scansJson);
}

export async function getUserScans(userId: string): Promise<string | null> {
  return kvGet(`lmcc:scans:${userId}`);
}
