// ═══════════════════════════════════════════════════════════════
// Client-side crypto for auth (browser only).
//
// The RAW PASSWORD NEVER LEAVES THE DEVICE. We derive a verifier
// locally with PBKDF2-SHA256 (150,000 iterations, per-user salt from
// the server) and send only that. Opening the network tab shows an
// opaque derived string — never the password. The server stores the
// verifier re-hashed with scrypt, so a DB leak alone cannot be
// replayed as a login either.
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

const ITERATIONS = 150_000;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export interface AuthCryptoChallenge {
  email: string;
  salt: string;
}

export interface RegisterRequest {
  mode: 'register';
  name: string;
  email: string;
  employeeId: string;
  role: 'seller' | 'compliance_officer';
  /** PBKDF2-derived verifier — raw password is never sent. */
  verifier: string;
}

export interface LoginRequest {
  mode: 'login';
  email: string;
  verifier: string;
}

/**
 * Registration flow: fetch a fresh random salt from the server, derive
 * the verifier locally, return the register payload. Raw password stays
 * in this closure and is discarded.
 */
export async function prepareRegister(input: {
  name: string;
  email: string;
  employeeId: string;
  role: 'seller' | 'compliance_officer';
  password: string;
}): Promise<RegisterRequest> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'challenge', email: input.email }),
  });
  if (!res.ok) throw new Error('Auth service unavailable');
  const challenge = (await res.json()) as AuthCryptoChallenge;
  const verifier = await pbkdf2(input.password, challenge.salt);
  return {
    mode: 'register',
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    employeeId: input.employeeId.trim(),
    role: input.role,
    verifier,
  };
}

/**
 * Login flow: fetch this account's salt, derive the verifier locally
 * (same 150k iterations), send only the verifier.
 */
export async function prepareLogin(email: string, password: string): Promise<LoginRequest> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'challenge', email }),
  });
  if (!res.ok) throw new Error('Auth service unavailable');
  const challenge = (await res.json()) as AuthCryptoChallenge;
  const verifier = await pbkdf2(password, challenge.salt);
  return { mode: 'login', email: email.trim().toLowerCase(), verifier };
}
