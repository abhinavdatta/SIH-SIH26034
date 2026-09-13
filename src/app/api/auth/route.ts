// ═══════════════════════════════════════════════════════════════
// Auth API — /api/auth
//
// POST modes:
//   challenge → { salt } for PBKDF2 derivation (anti-enumeration:
//               unknown emails get a deterministic decoy salt)
//   register  → create account (client PBKDF2 verifier; scrypt at rest)
//   login     → verify verifier, issue httpOnly session cookie
//   logout    → destroy session
// GET  → current session (decrypted PII) or { authenticated: false }
//
// Security properties:
//  - Raw passwords never transmitted (client-side PBKDF2 150k iters)
//  - Stored verifier is scrypt(client verifier) — DB leak ≠ replay
//  - PII encrypted AES-256-GCM with AUTH_PEPPER-derived key
//  - Email lookups use HMAC-SHA256 — no plaintext email at rest
//  - Session token: 256-bit random, httpOnly + SameSite cookie
//    (invisible to JS and to casual network-tab sniffing of payloads)
//  - Login/register rate limited per account+IP
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import 'server-only';
import {
  isPersistentBackend,
  getAccount,
  saveAccount,
  hashVerifier,
  verifyVerifier,
  encryptPII,
  decryptPII,
  emailLookupKey,
  newSessionToken,
  saveSession,
  getSessionByToken,
  deleteSession,
  indexUserId,
  getAccountById,
  type StoredAccount,
} from '@/lib/server/auth-store';
import { randomBytes, createHmac } from 'crypto';

const COOKIE_NAME = 'lmcc_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const IS_PROD = process.env.NODE_ENV === 'production';

/* ── Fail closed: production requires a real pepper ── */
function pepperConfigured(): boolean {
  return Boolean(process.env.AUTH_PEPPER && process.env.AUTH_PEPPER.length >= 16);
}

/* ── Naive per-instance rate limiter (per account+IP) ── */
const attempts = new Map<string, { count: number; firstAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function resetAttempts(key: string): void {
  attempts.delete(key);
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

/* ── Session cookie helpers ── */

async function issueSession(userId: string, role: 'seller' | 'compliance_officer'): Promise<string> {
  const token = newSessionToken();
  await saveSession(token, {
    userId,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

interface AccountPII {
  name: string;
  email: string;
  employeeId: string;
}

function decryptAccountPII(account: StoredAccount): AccountPII {
  const parsed = JSON.parse(decryptPII(account.pii)) as Partial<AccountPII>;
  return {
    name: parsed.name ?? '',
    email: parsed.email ?? '',
    employeeId: parsed.employeeId ?? '',
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}

function isValidHex64(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/* ── Handlers ── */

export async function POST(request: NextRequest) {
  // Production guardrail: refuse to create/store credentials unprotected.
  if (IS_PROD && !pepperConfigured()) {
    return NextResponse.json(
      { error: 'Auth is not configured: set AUTH_PEPPER (32+ random chars) in the deployment environment.' },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const mode = body.mode;

  /* ── challenge: return PBKDF2 salt (decoy for unknown accounts) ── */
  if (mode === 'challenge') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      // Shape-stable response; the real check happens at login/register.
      return NextResponse.json({ salt: randomBytes(16).toString('hex') });
    }
    const account = await getAccount(email);
    if (account) {
      // Salt is stored inside the scrypt hash (s1$salt$hash).
      const salt = account.passwordHash.split('$')[1] ?? '';
      if (salt) return NextResponse.json({ salt });
    }
    // Decoy: deterministic salt so response shape never reveals whether
    // the account exists (prevents account enumeration).
    const decoy = createHmac('sha256', process.env.AUTH_PEPPER || 'lmcc-dev-pepper-do-not-use-in-prod')
      .update(`challenge:${email}`)
      .digest('hex')
      .slice(0, 32);
    return NextResponse.json({ salt: decoy });
  }

  /* ── register ── */
  if (mode === 'register') {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().slice(0, 40) : '';
    const role = body.role === 'compliance_officer' ? 'compliance_officer' : body.role === 'seller' ? 'seller' : null;
    const verifier = body.verifier;

    if (name.length < 2) return NextResponse.json({ error: 'Please enter your full name' }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    if (!role) return NextResponse.json({ error: 'Select a role' }, { status: 400 });
    if (!isValidHex64(verifier)) {
      return NextResponse.json({ error: 'Invalid credential encoding — use a supported browser' }, { status: 400 });
    }

    const limiterKey = `register:${emailLookupKey(email)}:${clientIp(request)}`;
    if (rateLimited(limiterKey)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
    }

    const existing = await getAccount(email);
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const { hash } = hashVerifier(verifier);
    const userId = `u_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    const account: StoredAccount = {
      id: userId,
      emailIndex: emailLookupKey(email),
      pii: encryptPII(JSON.stringify({ name, email, employeeId })),
      role,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };
    await saveAccount(account);
    await indexUserId(userId, account.emailIndex);
    resetAttempts(limiterKey);
    await issueSession(userId, role);

    return NextResponse.json({
      authenticated: true,
      user: { name, email, employeeId, role },
      persistent: isPersistentBackend,
    });
  }

  /* ── login ── */
  if (mode === 'login') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const verifier = body.verifier;

    if (!isValidEmail(email) || !isValidHex64(verifier)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const limiterKey = `login:${emailLookupKey(email)}:${clientIp(request)}`;
    if (rateLimited(limiterKey)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
    }

    const account = await getAccount(email);
    // Constant-shape failure: same message whether the account exists,
    // the password is wrong, or the stored hash is malformed.
    if (!account || !verifyVerifier(verifier, account.passwordHash)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    resetAttempts(limiterKey);
    await issueSession(account.id, account.role);
    const pii = decryptAccountPII(account);

    return NextResponse.json({
      authenticated: true,
      user: { ...pii, role: account.role },
      persistent: isPersistentBackend,
    });
  }

  /* ── logout ── */
  if (mode === 'logout') {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (token) await deleteSession(token);
    jar.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
}

/* ── GET: current session ── */

export async function GET() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ authenticated: false });

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ authenticated: false });

  const account = await getAccountById(session.userId);
  if (!account) return NextResponse.json({ authenticated: false });

  const pii = decryptAccountPII(account);
  return NextResponse.json({
    authenticated: true,
    user: { ...pii, role: account.role },
    persistent: isPersistentBackend,
  });
}
