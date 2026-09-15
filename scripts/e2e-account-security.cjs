// ═══════════════════════════════════════════════════════════════
// Account-security E2E probe — exercises the NEW auth flows against
// a running deployment (default local, pass base-url to target prod):
//
//   1. register                          → session
//   2. save security answers             → ok
//   3. totp-setup + confirm (self-computed code — proves RFC 6238 impl) → enabled
//   4. login WITHOUT code                → totpRequired
//   5. login WITH correct code           → authenticated
//   6. login WITH wrong code             → rejected
//   7. forgot-start → wrong answers      → rejected, attempts counted
//   8. forgot-start → correct answers    → password reset + session
//   9. old-session GET after reset       → invalidated (passwordChangedAt)
//
// Usage: node scripts/e2e-account-security.cjs [base-url]
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

const { webcrypto, createHmac } = require('crypto');
const subtle = webcrypto.subtle;

const BASE = (process.argv[2] || 'http://localhost:3217').replace(/\/+$/, '');
const EMAIL = `secprobe-${Date.now()}@lmcc-test.invalid`;
const PASSWORD = 'first-password-42';
const NEW_PASSWORD = 'second-password-99';
const ANSWERS = ['Greenwood High', '  Chatterjee   ', 'Pulsar 220'];

function base32Decode(input) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of input.toUpperCase().replace(/[\s=]/g, '')) {
    const idx = A.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}

/** The 6-digit TOTP code for the secret right now (±1 step tolerated). */
function totpNow(secretB32) {
  const key = base32Decode(secretB32);
  const step = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', key).update(buf).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return (bin % 1_000_000).toString().padStart(6, '0');
}

async function pbkdf2Hex(password, saltHex) {
  const km = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(saltHex, 'hex'), iterations: 150000 },
    km, 256
  );
  return Buffer.from(bits).toString('hex');
}

async function post(body, jar) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jar?.cookie ? { cookie: jar.cookie } : {}) },
    body: JSON.stringify(body),
  });
  const sc = res.headers.get('set-cookie');
  if (sc && jar) jar.cookie = sc.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

async function challengeVerifier(password, email) {
  const c = await post({ mode: 'challenge', email });
  return pbkdf2Hex(password, c.data.salt);
}

(async () => {
  const out = [];
  const check = (name, ok, extra = '') => {
    out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
    if (!ok) process.exitCode = 1;
  };

  // 1. Register
  const jar1 = {};
  const reg = await post({ mode: 'register', name: 'Sec Probe', email: EMAIL, employeeId: 'SP-1', role: 'seller', verifier: await challengeVerifier(PASSWORD, EMAIL) }, jar1);
  check('register', reg.status === 200 && reg.data?.authenticated === true, reg.data?.error || '');

  // 2. Save security answers
  const save = await post({ mode: 'security-save', a1: ANSWERS[0], a2: ANSWERS[1], a3: ANSWERS[2] }, jar1);
  check('security-save', save.status === 200 && save.data?.ok === true, save.data?.error || '');

  // 3. TOTP setup + confirm with a self-computed code
  const setup = await post({ mode: 'totp-setup' }, jar1);
  check('totp-setup returns secret+uri', setup.status === 200 && typeof setup.data?.secret === 'string' && setup.data?.otpauthUrl?.startsWith('otpauth://totp/'), '');
  const confirm = await post({ mode: 'totp-confirm', code: totpNow(setup.data.secret) }, jar1);
  check('totp-confirm with valid code', confirm.status === 200 && confirm.data?.ok === true, confirm.data?.error || '');

  // 4. Login without code → totpRequired
  const noCode = await post({ mode: 'login', email: EMAIL, verifier: await challengeVerifier(PASSWORD, EMAIL) }, {});
  check('login without code → totpRequired', noCode.status === 401 && noCode.data?.totpRequired === true, noCode.data?.error || '');

  // 5. Login with correct code
  const goodCode = await post({ mode: 'login', email: EMAIL, verifier: await challengeVerifier(PASSWORD, EMAIL), totpCode: totpNow(setup.data.secret) }, {});
  check('login with correct code', goodCode.status === 200 && goodCode.data?.authenticated === true, goodCode.data?.error || '');

  // 6. Login with wrong code
  const badCode = await post({ mode: 'login', email: EMAIL, verifier: await challengeVerifier(PASSWORD, EMAIL), totpCode: '000000' }, {});
  check('login with wrong code → rejected', badCode.status === 401 && badCode.data?.totpRequired === true, badCode.data?.error || '');

  // 7. Forgot-start → wrong answers
  const start = await post({ mode: 'forgot-start', email: EMAIL }, {});
  check('forgot-start returns ticket+questions', start.status === 200 && typeof start.data?.ticket === 'string' && start.data?.questions?.length === 3, '');
  const wrong = await post({
    mode: 'forgot-reset', ticket: start.data.ticket,
    answers: ['wrong school', 'wrong name', 'wrong bike'],
    newVerifier: await challengeVerifier(NEW_PASSWORD, EMAIL),
  }, {});
  check('wrong answers → rejected with attempts left', wrong.status === 403 && /\d attempt/.test(wrong.data?.error ?? ''), wrong.data?.error || '');

  // 8. Correct answers → reset + session
  const jar2 = {};
  const good = await post({
    mode: 'forgot-reset', ticket: start.data.ticket, answers: ANSWERS,
    newVerifier: await challengeVerifier(NEW_PASSWORD, EMAIL),
  }, jar2);
  check('correct answers → reset + signed in', good.status === 200 && good.data?.authenticated === true, good.data?.error || '');

  // 9. Password change invalidates sessions issued before it: jar2's own
  //    cookie was issued AT reset (createdAt >= changedAt) → still valid;
  //    jar1's older session → must be dead.
  const oldSession = await fetch(`${BASE}/api/auth`, { headers: { cookie: jar1.cookie } }).then((r) => r.json()).catch(() => null);
  check('pre-reset session invalidated', oldSession?.authenticated === false, '');
  const newSession = await fetch(`${BASE}/api/auth`, { headers: { cookie: jar2.cookie } }).then((r) => r.json()).catch(() => null);
  check('post-reset session valid + totp still on', newSession?.authenticated === true && newSession?.totpEnabled === true, '');

  // 10. New password works at login (with TOTP code)
  const relogin = await post({ mode: 'login', email: EMAIL, verifier: await challengeVerifier(NEW_PASSWORD, EMAIL), totpCode: totpNow(setup.data.secret) }, {});
  check('login with NEW password + code', relogin.status === 200 && relogin.data?.authenticated === true, relogin.data?.error || '');

  console.log(`\nAccount-security E2E against ${BASE}`);
  console.log(`(throwaway: ${EMAIL})\n`);
  console.log(out.join('\n'));
})();
