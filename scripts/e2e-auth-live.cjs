// ═══════════════════════════════════════════════════════════════
// Live auth E2E probe — runs the FULL auth protocol against any
// deployment (default: https://lmcc-chi.vercel.app), using Node
// webcrypto to replicate src/lib/auth-crypto.ts exactly:
//
//   1. GET status                → backend / rateLimitMode surface
//   2. POST challenge            → deterministic per-email salt
//   3. POST register             → creates account, issues cookie
//   4. POST login (fresh jar)    → "second device" proves shared DB
//   5. POST login (wrong pw)     → must 401
//   6. GET with session cookie   → session resolves to the account
//
// Creates one throwaway account (e2e-probe-<ts>@lmcc-test.invalid)
// that can be deleted in Supabase → Table editor → lmcc_accounts.
//
// Usage: node scripts/e2e-auth-live.cjs [base-url]
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;

const BASE = (process.argv[2] || 'https://lmcc-chi.vercel.app').replace(/\/+$/, '');
const EMAIL = `e2e-probe-${Date.now()}@lmcc-test.invalid`;
const PASSWORD = 'correct horse battery staple 42!';
const WRONG_PASSWORD = 'totally wrong password';
const ITERATIONS = 150_000; // must match src/lib/auth-crypto.ts

async function pbkdf2Hex(password, saltHex) {
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = Buffer.from(saltHex, 'hex');
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    keyMaterial,
    256
  );
  return Buffer.from(bits).toString('hex');
}

async function post(body, jar) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jar?.cookie ? { cookie: jar.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && jar) jar.cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, data };
}

(async () => {
  const out = [];
  const check = (name, ok, extra = '') => {
    out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
    if (!ok) process.exitCode = 1;
  };

  // 1. Deployment status (any durable backend qualifies: supabase/redis/file)
  const status = await fetch(`${BASE}/api/auth`).then((r) => r.json()).catch(() => null);
  check(
    'GET /api/auth reports a durable backend',
    !!status && status.persistent === true,
    JSON.stringify(status)
  );

  // 2. Challenge salt
  const challenge = await post({ mode: 'challenge', email: EMAIL });
  const salt = challenge.data?.salt;
  check('challenge returns a salt', challenge.status === 200 && typeof salt === 'string' && salt.length >= 32);

  // 3. Register (as the browser would)
  const verifier = await pbkdf2Hex(PASSWORD, salt);
  const jar1 = {};
  const reg = await post(
    { mode: 'register', name: 'E2E Probe', email: EMAIL, employeeId: 'E2E-001', role: 'seller', verifier },
    jar1
  );
  check(
    'register creates account + session',
    reg.status === 200 && reg.data?.authenticated === true && typeof jar1.cookie === 'string',
    reg.data?.error || `role=${reg.data?.user?.role}`
  );

  // 4. Login from a "second device" (fresh cookie jar)
  const challenge2 = await post({ mode: 'challenge', email: EMAIL });
  const verifier2 = await pbkdf2Hex(PASSWORD, challenge2.data.salt);
  const jar2 = {};
  const login = await post({ mode: 'login', email: EMAIL, verifier: verifier2 }, jar2);
  check(
    'login from second device',
    login.status === 200 && login.data?.authenticated === true && typeof jar2.cookie === 'string',
    login.data?.error || ''
  );

  // 5. Wrong password must fail
  const badVerifier = await pbkdf2Hex(WRONG_PASSWORD, challenge2.data.salt);
  const bad = await post({ mode: 'login', email: EMAIL, verifier: badVerifier }, {});
  check('wrong password rejected (401)', bad.status === 401, bad.data?.error || '');

  // 6. Session cookie resolves to the account
  const me = await fetch(`${BASE}/api/auth`, { headers: { cookie: jar2.cookie } })
    .then((r) => r.json())
    .catch(() => null);
  check(
    'session persists via GET + cookie',
    !!me && me.authenticated === true && me.user?.email === EMAIL,
    me?.user ? `${me.user.name} <${me.user.email}>` : JSON.stringify(me)
  );

  console.log(`\nAuth E2E against ${BASE}`);
  console.log(`(throwaway account: ${EMAIL} — delete via Supabase Table editor if desired)\n`);
  console.log(out.join('\n'));
})();
