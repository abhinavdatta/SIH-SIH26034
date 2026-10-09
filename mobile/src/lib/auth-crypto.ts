// ═══════════════════════════════════════════════════════════════
// Client-side crypto for auth (React Native port).
//
// The RAW PASSWORD NEVER LEAVES THE DEVICE. We derive a verifier
// locally with PBKDF2-SHA256 (150,000 iterations, per-user salt from
// the server) and send only that. The server stores the verifier
// re-hashed with scrypt, so a DB leak alone cannot be replayed as a
// login either.
//
// The web app derives this with WebCrypto (crypto.subtle), which
// Hermes does not provide; here the identical algorithm runs via
// @noble/hashes (pure TypeScript, audited). Output is byte-for-byte
// the same 256-bit hex verifier the browser produces — the server
// cannot tell the two clients apart.
//
// Ported from the LMCC web app. Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { apiJson, unreachableError } from './api';

const ITERATIONS = 150_000;

/** UTF-8 encoder (avoids relying on TextEncoder in Hermes). */
function utf8Bytes(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      // Surrogate pair
      const low = input.charCodeAt(++i);
      const cp = 0x10000 + ((code & 0x3ff) << 10) + (low & 0x3ff);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  return Uint8Array.from(out);
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g) ?? [];
  return Uint8Array.from(pairs.map((h) => parseInt(h, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** PBKDF2-SHA256(password, salt, 150k iters) → 256-bit hex verifier. */
export function pbkdf2Verifier(password: string, saltHex: string): string {
  return bytesToHex(pbkdf2(sha256, utf8Bytes(password), hexToBytes(saltHex), { c: ITERATIONS, dkLen: 32 }));
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
  /** Required server-side when role is compliance_officer (OFFICER_INVITE_CODES). */
  inviteCode?: string;
  /** PBKDF2-derived verifier — raw password is never sent. */
  verifier: string;
}

export interface LoginRequest {
  mode: 'login';
  email: string;
  verifier: string;
  /** 6-digit authenticator code — required when the account has 2FA on. */
  totpCode?: string;
}

/** Error whose message came from the server (setup guidance, 403s, etc.). */
export class AuthServerError extends Error {}

/** Fetch the challenge salt; surface the server's actual error message
    (e.g. the 503 deployment-setup guidance) instead of a generic one. */
async function fetchChallengeSalt(email: string): Promise<string> {
  const { ok, data } = await apiJson<{ salt?: string; error?: string }>('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ mode: 'challenge', email }),
  });
  if (!ok || !data.salt) {
    throw new AuthServerError(data.error ?? unreachableError());
  }
  return data.salt;
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
  inviteCode?: string;
  password: string;
}): Promise<RegisterRequest> {
  const salt = await fetchChallengeSalt(input.email.trim().toLowerCase());
  const verifier = pbkdf2Verifier(input.password, salt);
  return {
    mode: 'register',
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    employeeId: input.employeeId.trim(),
    role: input.role,
    inviteCode: input.inviteCode?.trim() || undefined,
    verifier,
  };
}

/**
 * Login flow: fetch this account's salt, derive the verifier locally
 * (same 150k iterations), send only the verifier. When the account has
 * 2FA enabled the server replies totpRequired and the SAME verifier is
 * resent with the authenticator code — no re-derivation needed.
 */
export async function prepareLogin(email: string, password: string, totpCode?: string): Promise<LoginRequest> {
  const salt = await fetchChallengeSalt(email.trim().toLowerCase());
  const verifier = pbkdf2Verifier(password, salt);
  return { mode: 'login', email: email.trim().toLowerCase(), verifier, ...(totpCode ? { totpCode } : {}) };
}

/** Password-reset flow: derive a verifier for the NEW password using the
 * account's challenge salt (same derivation as login — after the reset,
 * login just works with the new password). */
export async function prepareReset(
  email: string,
  newPassword: string,
  answers: string[],
  ticket: string
): Promise<{ mode: 'forgot-reset'; ticket: string; answers: string[]; newVerifier: string }> {
  const salt = await fetchChallengeSalt(email.trim().toLowerCase());
  const newVerifier = pbkdf2Verifier(newPassword, salt);
  return { mode: 'forgot-reset', ticket, answers, newVerifier };
}

/** Change-password flow (signed in): verifiers for current + new password.
 * Both use the account's challenge salt so the current one verifies against
 * the stored hash and the new one logs in cleanly afterwards. */
export async function prepareChangePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ mode: 'change-password'; currentVerifier: string; newVerifier: string }> {
  const salt = await fetchChallengeSalt(email.trim().toLowerCase());
  const currentVerifier = pbkdf2Verifier(currentPassword, salt);
  const newVerifier = pbkdf2Verifier(newPassword, salt);
  return { mode: 'change-password', currentVerifier, newVerifier };
}
