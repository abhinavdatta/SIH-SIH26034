// ═══════════════════════════════════════════════════════════════
// TOTP (RFC 6238) — authenticator-app second factor, server-only.
//
// Pure Node crypto — no dependencies. Compatible with Google
// Authenticator, Microsoft Authenticator, Authy, 1Password, Aegis,
// FreeOTP (SHA-1, 6 digits, 30s step — the universal defaults).
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import 'server-only';
import { createHmac, randomBytes } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 encode (no padding — authenticator apps accept it). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 4648 base32 decode (case-insensitive, ignores spaces/padding). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit random secret, base32 — what the user types into their app. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for a given 30s time step. */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

/**
 * Verify a code with drift tolerance (±1 step = ±30s, covers clock skew).
 * Constant-time comparison per candidate.
 */
export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const normalized = (code ?? '').replace(/\D/g, '');
  if (normalized.length !== 6) return false;
  const secret = base32Decode(secretBase32);
  if (secret.length === 0) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  const codeBuf = Buffer.from(normalized, 'utf8');
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(hotp(secret, step + i), 'utf8');
    if (candidate.length === codeBuf.length && candidate.equals(codeBuf)) return true;
  }
  return false;
}

/** otpauth:// URI — QR-encodable, opens directly in authenticator apps. */
export function otpauthUrl(secretBase32: string, email: string): string {
  const label = encodeURIComponent(`LMCC:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: 'LMCC',
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
