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
  ensureSupabaseSchema,
  isSupabaseBackend,
  isDurableBackend,
  backendName,
  pepperSource,
  rateLimitMode,
  hitRateLimit,
  resetRateLimit,
  getSecurityData,
  saveSecurityData,
  saveResetTicket,
  getResetTicket,
  updateResetTicketAttempts,
  deleteResetTicket,
  hashSecurityAnswer,
  verifySecurityAnswer,
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
import { randomBytes, createHmac, createHash, timingSafeEqual } from 'crypto';
import { generateTotpSecret, verifyTotp, otpauthUrl } from '@/lib/server/totp';

const COOKIE_NAME = 'lmcc_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const IS_PROD = process.env.NODE_ENV === 'production';

/* ── Account-security constants ── */

/** Reset tickets: 15 minutes, max 5 answer attempts, single-use. */
const TICKET_TTL_MS = 15 * 60 * 1000;
const TICKET_MAX_ATTEMPTS = 5;

/** The three questions offered at setup; the user answers all three. */
const SECURITY_QUESTIONS = [
  'What was the name of your first school?',
  'What is your mother\'s maiden name?',
  'What was the model of your first car or bike?',
] as const;

function sha256b64(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

/**
 * SECURITY QUESTIONS — the fixed list served to the client.
 */
function securityQuestionList(): string[] {
  return [...SECURITY_QUESTIONS];
}

/** Per-account security flags that ride on every authenticated response. */
async function securityFlags(userId: string): Promise<{ totpEnabled: boolean; hasSecurityAnswers: boolean }> {
  const sec = await getSecurityData(userId);
  return {
    totpEnabled: sec?.totpEnabled === true,
    hasSecurityAnswers: Array.isArray(sec?.answers) && (sec.answers as unknown[]).length === 3,
  };
}

/* ── Fail closed: production requires a real pepper — from the env, or a
   persisted server-generated secret on a durable filesystem. ── */
function pepperConfigured(): boolean {
  return pepperSource() !== 'none';
}

/**
 * Verify the Supabase schema exists (migration 0001 run) before touching
 * credentials — answers with actionable setup guidance instead of an
 * opaque 500 from PostgREST 404s. Falls through (undefined) when Supabase
 * isn't the configured backend, so the check is a no-op elsewhere.
 */
async function schemaGuard(): Promise<NextResponse | undefined> {
  if (!isSupabaseBackend) return undefined;
  if (await ensureSupabaseSchema()) return undefined;
  return NextResponse.json(
    {
      error:
        'Auth database is not initialized on this deployment. Run BOTH supabase/migrations (0001_lmcc_auth.sql AND 0002_account_security.sql) in the Supabase Dashboard → SQL Editor, then retry — no redeploy needed.',
    },
    { status: 503, headers: { 'Retry-After': '60' } }
 );
}

/* ── Invite-code gate for the privileged role ──

   Registration is public, so role self-selection must be validated
   SERVER-side (the client's role field is untrusted). Officer accounts
   require a code from OFFICER_INVITE_CODES (comma-separated); with the
   env unset, officer registration is refused and every new account is
   a seller — setting the env and sharing the code once is the
   first-officer path. Codes are hashed before comparison (timing-safe). */

function officerCodesEnabled(): boolean {
  return Boolean(process.env.OFFICER_INVITE_CODES?.trim());
}

function isOfficerCodeValid(code: string): boolean {
  const codes = (process.env.OFFICER_INVITE_CODES ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (codes.length === 0) return false;
  const candidate = createHash('sha256').update(code).digest();
  return codes.some((c) => {
    const known = createHash('sha256').update(c).digest();
    return candidate.length === known.length && timingSafeEqual(candidate, known);
  });
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

/** Deterministic per-account PBKDF2 salt — MUST stay stable forever. */
function challengeSalt(email: string): string {
  return createHmac('sha256', process.env.AUTH_PEPPER || 'lmcc-dev-pepper-do-not-use-in-prod')
    .update(`challenge:${email}`)
    .digest('hex')
    .slice(0, 32);
}

/* ── Rate limiter: durable counters via the auth store (Redis INCR/EXPIRE
   across instances when configured; file-backed on self-hosted; per-instance
   memory only as the documented last resort). Mode is surfaced in the GET
   status response next to `persistent`. */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

async function rateLimited(key: string): Promise<boolean> {
  return hitRateLimit(key, WINDOW_MS, MAX_ATTEMPTS);
}

async function resetAttempts(key: string): Promise<void> {
  await resetRateLimit(key);
}

export async function POST(request: NextRequest) {
  // Production guardrail: refuse to create/store credentials unprotected.
  if (IS_PROD && !pepperConfigured()) {
    const onVercel = Boolean(process.env.VERCEL);
    const hint = onVercel
      ? 'On Vercel: set AUTH_PEPPER (32+ random chars) in Settings → Environment Variables, and configure a durable store (Supabase via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or a KV/Redis store) — then redeploy.'
      : 'Set AUTH_PEPPER (32+ random chars) in the environment — see .env.example. A durable local store is used automatically on self-hosted servers.';
    return NextResponse.json(
      { error: `Auth is not configured on this deployment. ${hint}` },
      { status: 503 }
    );
  }

  // Supabase schema must exist (migration 0001 run) — answer with setup
  // guidance instead of a bare 500 from missing tables.
  const schemaProblem = await schemaGuard();
  if (schemaProblem) return schemaProblem;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const mode = body.mode;

  /* ── challenge: return the account's PBKDF2 salt ──

     The salt is a deterministic HMAC(email, server secret): identical at
     registration and at every later login (the client must derive the SAME
     verifier both times), stable in shape whether or not the account exists
     (anti-enumeration), and unforgeable without AUTH_PEPPER. It must be a
     pure function of the email — deriving it from the stored scrypt hash
     (as an earlier revision did) broke login permanently, because the
     register-time verifier used the challenge salt, not the scrypt salt. */
  if (mode === 'challenge') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      // Shape-stable random response; the real check happens at login/register.
      return NextResponse.json({ salt: randomBytes(16).toString('hex') });
    }
    return NextResponse.json({ salt: challengeSalt(email) });
  }

  /* ── register ── */
  if (mode === 'register') {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().slice(0, 40) : '';
    const requestedRole = body.role === 'compliance_officer' ? 'compliance_officer' : body.role === 'seller' ? 'seller' : null;
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
    const verifier = body.verifier;

    if (name.length < 2) return NextResponse.json({ error: 'Please enter your full name' }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    if (!requestedRole) return NextResponse.json({ error: 'Select a role' }, { status: 400 });
    if (!isValidHex64(verifier)) {
      return NextResponse.json({ error: 'Invalid credential encoding — use a supported browser' }, { status: 400 });
    }

    // SERVER-side privilege gate — the client-submitted role is untrusted.
    // Data is per-account, so this protects role integrity, not cross-user
    // data; still, officer status must not be self-claimable.
    let role: 'seller' | 'compliance_officer';
    if (requestedRole === 'compliance_officer') {
      if (!officerCodesEnabled()) {
        return NextResponse.json(
          { error: 'Compliance Officer registration is not enabled on this deployment. Register as a Seller, or configure OFFICER_INVITE_CODES.' },
          { status: 403 }
        );
      }
      if (!inviteCode || !isOfficerCodeValid(inviteCode)) {
        return NextResponse.json(
          { error: 'Invalid or missing officer invite code' },
          { status: 403 }
        );
      }
      role = 'compliance_officer';
    } else {
      // Sellers are the public default — a client omitting/claming officer
      // without a code gets seller regardless.
      role = 'seller';
    }

    const limiterKey = `register:${emailLookupKey(email)}:${clientIp(request)}`;
    if (await rateLimited(limiterKey)) {
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
    await resetAttempts(limiterKey);
    await issueSession(userId, role);

    return NextResponse.json({
      authenticated: true,
      user: { name, email, employeeId, role },
      ...(await securityFlags(userId)),
      ...(await deploymentStatus()),
    });
  }

  /* ── login ── */
  if (mode === 'login') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const verifier = body.verifier;
    const totpCode = typeof body.totpCode === 'string' ? body.totpCode.trim() : '';

    if (!isValidEmail(email) || !isValidHex64(verifier)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const limiterKey = `login:${emailLookupKey(email)}:${clientIp(request)}`;
    if (await rateLimited(limiterKey)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
    }

    const account = await getAccount(email);
    // Constant-shape failure: same message whether the account exists,
    // the password is wrong, or the stored hash is malformed.
    if (!account || !verifyVerifier(verifier, account.passwordHash)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Optional second factor: when TOTP is enabled, the first correct
    // password step responds with totpRequired instead of a session.
    const sec = await getSecurityData(account.id);
    if (sec && sec.totpEnabled === true && typeof sec.totpSecret === 'string') {
      const secret = decryptPII(sec.totpSecret);
      if (!secret) {
        console.error(`[auth] unreadable TOTP secret for ${account.id} — 2FA check skipped`);
      } else if (!totpCode) {
        return NextResponse.json(
          { error: 'Enter the 6-digit code from your authenticator app', totpRequired: true },
          { status: 401 }
        );
      } else if (!verifyTotp(secret, totpCode)) {
        return NextResponse.json(
          { error: 'Invalid authenticator code', totpRequired: true },
          { status: 401 }
        );
      }
    }

    await resetAttempts(limiterKey);
    await issueSession(account.id, account.role);
    const pii = decryptAccountPII(account);

    return NextResponse.json({
      authenticated: true,
      user: { ...pii, role: account.role },
      ...(await securityFlags(account.id)),
      persistent: isDurableBackend,
    });
  }

  /* ── security-setup: list of questions (no auth needed; static data) ── */
  if (mode === 'security-setup') {
    return NextResponse.json({ questions: securityQuestionList() });
  }

  /* ── security-save: set security questions (requires session) ── */
  if (mode === 'security-save') {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    const session = token ? await getSessionByToken(token) : null;
    if (!session) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

    const answers = [
      typeof body.a1 === 'string' ? body.a1 : '',
      typeof body.a2 === 'string' ? body.a2 : '',
      typeof body.a3 === 'string' ? body.a3 : '',
    ];
    if (answers.some((a) => a.trim().length < 2)) {
      return NextResponse.json({ error: 'Answer all three questions (2+ characters each)' }, { status: 400 });
    }

    const existing = (await getSecurityData(session.userId)) ?? {};
    existing.questions = securityQuestionList();
    existing.answers = answers.map((a) => encryptPII(hashSecurityAnswer(a)));
    await saveSecurityData(session.userId, existing);
    return NextResponse.json({ ok: true });
  }

  /* ── totp-setup: generate a pending secret + otpauth URL (requires session) ── */
  if (mode === 'totp-setup') {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    const session = token ? await getSessionByToken(token) : null;
    if (!session) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

    const account = await getAccountById(session.userId);
    const email = account ? decryptAccountPII(account).email : 'user';
    const secret = generateTotpSecret();

    const existing = (await getSecurityData(session.userId)) ?? {};
    existing.totpPendingSecret = encryptPII(secret);
    await saveSecurityData(session.userId, existing);

    return NextResponse.json({ secret, otpauthUrl: otpauthUrl(secret, email) });
  }

  /* ── totp-confirm: verify a code against the pending secret, enable 2FA ── */
  if (mode === 'totp-confirm') {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    const session = token ? await getSessionByToken(token) : null;
    if (!session) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const sec = (await getSecurityData(session.userId)) ?? {};
    if (typeof sec.totpPendingSecret !== 'string') {
      return NextResponse.json({ error: 'Start the authenticator setup first' }, { status: 400 });
    }
    const secret = decryptPII(sec.totpPendingSecret);
    if (!secret || !verifyTotp(secret, code)) {
      return NextResponse.json({ error: 'That code did not match — check your app and try again' }, { status: 400 });
    }

    sec.totpSecret = sec.totpPendingSecret;
    sec.totpEnabled = true;
    delete sec.totpPendingSecret;
    await saveSecurityData(session.userId, sec);
    return NextResponse.json({ ok: true });
  }

  /* ── totp-disable: turn 2FA off (requires current password) ── */
  if (mode === 'totp-disable') {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    const session = token ? await getSessionByToken(token) : null;
    if (!session) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

    const verifier = body.verifier;
    const account = await getAccountById(session.userId);
    if (!account || !isValidHex64(verifier) || !verifyVerifier(verifier, account.passwordHash)) {
      return NextResponse.json({ error: 'Password confirmation failed' }, { status: 403 });
    }

    const sec = (await getSecurityData(session.userId)) ?? {};
    delete sec.totpSecret;
    sec.totpEnabled = false;
    await saveSecurityData(session.userId, sec);
    return NextResponse.json({ ok: true });
  }

  /* ── forgot-start: begin a password reset (anti-enumeration: same
     response whether or not the account exists). Uses the TOTP of the
     reset flow: a short-lived single-use ticket held in memory. ── */
  if (mode === 'forgot-start') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const limiterKey = `forgot:${emailLookupKey(email)}:${clientIp(request)}`;
    if (await rateLimited(limiterKey)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
    }

    // Always mint a ticket-shaped response even when the account doesn't
    // exist — identical shape, no enumeration signal.
    const ticket = randomBytes(24).toString('base64url');
    const account = await getAccount(email);
    if (account) {
      await saveResetTicket(sha256b64(ticket), account.id, new Date(Date.now() + TICKET_TTL_MS).toISOString());
    }

    return NextResponse.json({
      ticket,
      questions: securityQuestionList(),
      // The client shows this generic text either way.
      message: 'Answer your security questions to reset your password. The reset link expires in 15 minutes.',
    });
  }

  /* ── forgot-reset: answer questions + set the new password ── */
  if (mode === 'forgot-reset') {
    const ticketValue = typeof body.ticket === 'string' ? body.ticket : '';
    const newVerifier = body.newVerifier;
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!ticketValue || !isValidHex64(newVerifier) || answers.length !== 3) {
      return NextResponse.json({ error: 'Invalid reset request' }, { status: 400 });
    }

    const limiterKey = `reset:${clientIp(request)}`;
    if (await hitRateLimit(limiterKey, WINDOW_MS, 10)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
    }

    const rec = await getResetTicket(sha256b64(ticketValue));
    const GenericFail = { error: 'Reset failed — the ticket may have expired. Start again.' };
    if (!rec) return NextResponse.json(GenericFail, { status: 400 });

    if (new Date(rec.expiresAt).getTime() < Date.now()) {
      await deleteResetTicket(sha256b64(ticketValue));
      return NextResponse.json(GenericFail, { status: 400 });
    }

    // Bounded guessing: after TICKET_MAX_ATTEMPTS wrong answer sets, the
    // ticket dies.
    if (rec.attempts >= TICKET_MAX_ATTEMPTS) {
      await deleteResetTicket(sha256b64(ticketValue));
      return NextResponse.json(GenericFail, { status: 400 });
    }

    const sec = await getSecurityData(rec.userId);
    const stored = sec && Array.isArray(sec.answers) ? (sec.answers as unknown[]) : [];
    if (stored.length !== 3) {
      // No questions configured — can't reset via questions.
      return NextResponse.json(
        { error: 'This account has no security questions configured. Contact your administrator.' },
        { status: 400 }
      );
    }

    const allCorrect = answers.every(
      (a, i) => typeof a === 'string' && i < stored.length && typeof stored[i] === 'string' && verifySecurityAnswer(a, decryptPII(stored[i] as string))
    );
    if (!allCorrect) {
      await updateResetTicketAttempts(sha256b64(ticketValue), rec.attempts + 1);
      const left = Math.max(0, TICKET_MAX_ATTEMPTS - (rec.attempts + 1));
      return NextResponse.json(
        { error: `One or more answers are incorrect.${left > 0 ? ` ${left} attempt${left === 1 ? '' : 's'} remaining.` : ''}` },
        { status: 403 }
      );
    }

    // Success: rotate the verifier, invalidate old sessions, issue fresh one.
    const account = await getAccountById(rec.userId);
    if (!account) return NextResponse.json(GenericFail, { status: 400 });

    const now = new Date().toISOString();
    const { hash } = hashVerifier(newVerifier);
    await saveAccount({ ...account, passwordHash: hash, passwordChangedAt: now });
    await deleteResetTicket(sha256b64(ticketValue));
    await issueSession(rec.userId, account.role);

    const pii = decryptAccountPII(account);
    return NextResponse.json({
      authenticated: true,
      user: { ...pii, role: account.role },
      ...(await securityFlags(account.id)),
      persistent: isDurableBackend,
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

/* ── GET: current session + deployment status ──

   Deployment metadata (persistent / rateLimitMode / officerRegistration)
   rides on EVERY response shape, including unauthenticated ones — the
   login screen renders the role picker before any session exists. */

async function deploymentStatus() {
  return {
    persistent: isDurableBackend,
    backend: backendName(),
    rateLimitMode: rateLimitMode(),
    officerRegistration: officerCodesEnabled(),
    securityQuestions: securityQuestionList(),
    // Only meaningful (and only present) when Supabase is the backend.
    ...(isSupabaseBackend ? { schemaReady: await ensureSupabaseSchema() } : {}),
  };
}

export async function GET() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ authenticated: false, ...(await deploymentStatus()) });

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ authenticated: false, ...(await deploymentStatus()) });

  const account = await getAccountById(session.userId);
  if (!account) return NextResponse.json({ authenticated: false, ...(await deploymentStatus()) });

  // A password reset invalidates sessions issued before it — other
  // devices are logged out instead of keeping a stale identity.
  if (account.passwordChangedAt && new Date(session.createdAt).getTime() < new Date(account.passwordChangedAt).getTime()) {
    await deleteSession(token);
    return NextResponse.json({ authenticated: false, ...(await deploymentStatus()) });
  }

  const pii = decryptAccountPII(account);
  return NextResponse.json({
    authenticated: true,
    user: { ...pii, role: account.role },
    ...(await securityFlags(account.id)),
    ...(await deploymentStatus()),
  });
}
