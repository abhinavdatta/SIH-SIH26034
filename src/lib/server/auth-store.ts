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

/* ── Backend selection ── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
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

/* ── In-memory fallback (dev only) ── */

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

/* ── Generic KV ops ── */

async function kvGet(key: string): Promise<string | null> {
  if (isPersistentBackend) {
    const v = await redisCommand<string>(['GET', key]);
    return v ?? null;
  }
  return memoryGet(key);
}

async function kvSet(key: string, value: string): Promise<void> {
  if (isPersistentBackend) {
    await redisCommand(['SET', key, value]);
    return;
  }
  await memorySet(key, value);
}

async function kvDel(key: string): Promise<void> {
  if (isPersistentBackend) {
    await redisCommand(['DEL', key]);
    return;
  }
  await memoryDel(key);
}

/* ── Secrets ── */

function getPepper(): Buffer {
  const raw = process.env.AUTH_PEPPER;
  if (raw && raw.length >= 16) {
    return createHash('sha256').update(raw).digest(); // 32 bytes
  }
  // Dev-only deterministic key so local flows work without env setup.
  // Production MUST set AUTH_PEPPER (checked in the auth route).
  return createHash('sha256').update('lmcc-dev-pepper-do-not-use-in-prod').digest();
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
  const { hash } = hashVerifier(clientVerifier, parts[1]);
  const a = Buffer.from(hash);
  const b = Buffer.from(parts[2]);
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
  await kvSet(`lmcc:sess:${token}`, JSON.stringify(session));
  if (isPersistentBackend) {
    await redisCommand(['EXPIRE', `lmcc:sess:${token}`, Math.floor(SESSION_TTL_MS / 1000)]);
  }
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

/* ── Scan storage (cross-device) ── */

export async function saveUserScans(userId: string, scansJson: string): Promise<void> {
  await kvSet(`lmcc:scans:${userId}`, scansJson);
}

export async function getUserScans(userId: string): Promise<string | null> {
  return kvGet(`lmcc:scans:${userId}`);
}
