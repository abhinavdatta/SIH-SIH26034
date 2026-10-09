// ═══════════════════════════════════════════════════════════════
// E2E protocol check — proves the mobile app's API contract against
// a running LMCC backend, WITHOUT needing a device:
//   challenge → PBKDF2 verifier (same noble code as auth-crypto.ts)
//   → register → cookie session → scans push/pull → logout → login.
//
// Usage: node scripts/e2e-protocol.mjs [baseUrl]
// Default: http://localhost:3000
// ═══════════════════════════════════════════════════════════════

import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ITERATIONS = 150_000;
const email = `mobile-e2e-${Date.now()}@lmcc.test`;

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures += 1;
}

function utf8Bytes(input) {
  const out = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(++i);
      const cp = 0x10000 + ((code & 0x3ff) << 10) + (low & 0x3ff);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(out);
}

function hexToBytes(hex) {
  return Uint8Array.from((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Identical derivation to mobile src/lib/auth-crypto.ts
function pbkdf2Verifier(password, saltHex) {
  return bytesToHex(pbkdf2(sha256, utf8Bytes(password), hexToBytes(saltHex), { c: ITERATIONS, dkLen: 32 }));
}

function cookieFrom(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? ''];
  for (const c of list) {
    const m = /lmcc_session=([^;]+)/.exec(c);
    if (m) return `lmcc_session=${m[1]}`;
  }
  return null;
}

async function api(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { res, data };
}

console.log(`LMCC mobile e2e protocol check against ${BASE}\n`);

/* 1 · challenge salt */
const { data: challenge } = await api('/api/auth', {
  method: 'POST',
  body: { mode: 'challenge', email },
});
check('challenge returns a salt', typeof challenge.salt === 'string' && challenge.salt.length > 0, `salt=${challenge.salt?.slice(0, 12)}…`);

/* 2 · register with the locally-derived verifier */
const password = 'ScanTest2026';
const verifier = pbkdf2Verifier(password, challenge.salt);
const { res: regRes, data: reg } = await api('/api/auth', {
  method: 'POST',
  body: { mode: 'register', name: 'Mobile E2E', email, employeeId: 'E2E-01', role: 'seller', verifier },
});
const cookie = cookieFrom(regRes);
check('register authenticates', reg.authenticated === true, `user=${reg.user?.email ?? 'none'}`);
check('server sets an httpOnly session cookie', cookie !== null);

/* 3 · session survives on the cookie alone (cold app start) */
const { data: session } = await api('/api/auth', { cookie });
check('GET /api/auth restores the session from the cookie', session.authenticated === true, `role=${session.user?.role}`);

/* 4 · push a scan snapshot */
const scan = {
  id: 'e2e_scan_1',
  productName: 'E2E Test Product',
  manufacturerName: 'E2E Labs',
  status: 'non_compliant',
  ocrConfidence: 0.91,
  isHazardousProduct: null,
  createdAt: new Date().toISOString(),
  fields: [
    {
      id: 'f1',
      fieldName: 'mrp',
      value: '₹49.00',
      confidence: 0.95,
      complianceStatus: 'compliant',
      ruleReference: 'Rule 6(1)(c)',
      notes: null,
      reviewStatus: 'approved',
    },
    {
      id: 'f2',
      fieldName: 'net_quantity',
      value: null,
      confidence: 0,
      complianceStatus: 'missing',
      ruleReference: 'Rule 6(1)(b)',
      notes: 'Net quantity missing — mandatory under Rule 6(1)(b)',
      violationType: 'net_quantity',
      violationDescription: 'Net quantity missing — mandatory under Rule 6(1)(b)',
      severity: 'HIGH',
      reviewStatus: 'pending',
    },
  ],
  violations: [
    { id: 'v1', scanFieldId: 'f2', violationType: 'net_quantity', description: 'Net quantity missing', severity: 'HIGH', isOverridden: false },
  ],
};
const { data: pushed } = await api('/api/scans', { method: 'POST', cookie, body: { mode: 'push', scans: [scan] } });
check('scans push accepted', pushed.ok === true);

/* 5 · pull the snapshot back */
const { data: pulled } = await api('/api/scans', { cookie });
check(
  'scans pull returns the pushed snapshot',
  pulled.authenticated === true && Array.isArray(pulled.scans) && pulled.scans.some((s) => s.id === 'e2e_scan_1'),
  `${pulled.scans?.length ?? 0} scan(s) on the account`
);

/* 6 · logout kills the session */
await api('/api/auth', { method: 'POST', cookie, body: { mode: 'logout' } });
const { data: afterLogout } = await api('/api/auth', { cookie });
check('logout invalidates the session cookie', afterLogout.authenticated === false);

/* 7 · fresh login with the same derivation */
const { data: challenge2 } = await api('/api/auth', { method: 'POST', body: { mode: 'challenge', email } });
const verifier2 = pbkdf2Verifier(password, challenge2.salt);
const { data: login } = await api('/api/auth', { method: 'POST', body: { mode: 'login', email, verifier: verifier2 } });
check('login with a re-derived verifier succeeds', login.authenticated === true, 'same PBKDF2 path as the app');

/* 8 · scans are still there for the re-logged-in session */
const { data: repull } = await api('/api/scans', { cookie: cookieFrom((await api('/api/auth', { method: 'POST', body: { mode: 'login', email, verifier: verifier2 } })).res) });
check('cross-device history survives', repull.scans?.some((s) => s.id === 'e2e_scan_1') === true);

console.log(failures === 0 ? '\nAll protocol checks passed — the mobile client contract works against this backend.' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
