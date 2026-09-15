// ═══════════════════════════════════════════════════════════════
// Backup-codes E2E — verifies that enabling 2FA issues ten single-use
// backup codes, that one can replace a TOTP code at login exactly once,
// and that the authenticator keeps working afterwards.
//
// Usage: node scripts/e2e-backup-codes.cjs [base-url]
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

const { webcrypto, createHmac } = require('crypto');
const subtle = webcrypto.subtle;

const BASE = (process.argv[2] || 'http://localhost:3225').replace(/\/+$/, '');
const EMAIL = `bkp-${Date.now()}@lmcc-test.invalid`;
const PASSWORD = 'Passw0rdAA';

function b32d(i) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let b = 0, v = 0; const o = [];
  for (const c of i.toUpperCase()) {
    const x = A.indexOf(c); if (x < 0) continue;
    v = (v << 5) | x; b += 5;
    if (b >= 8) { o.push((v >>> (b - 8)) & 255); b -= 8; }
  }
  return Buffer.from(o);
}

function totpNow(secretB32) {
  const k = b32d(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac('sha1', k).update(buf).digest();
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
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
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  const out = [];
  const check = (name, ok, extra = '') => {
    out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
    if (!ok) process.exitCode = 1;
  };

  const saltOf = async (email) => (await post({ mode: 'challenge', email })).data.salt;
  const jar = {};

  const reg = await post({ mode: 'register', name: 'Bkp Tester', email: EMAIL, employeeId: '1', role: 'seller', verifier: await pbkdf2Hex(PASSWORD, await saltOf(EMAIL)) }, jar);
  check('register', reg.status === 200, reg.data?.error || '');

  await post({ mode: 'security-save', a1: 'alpha', a2: 'beta', a3: 'gamma' }, jar);

  const setup = await post({ mode: 'totp-setup' }, jar);
  const confirm = await post({ mode: 'totp-confirm', code: totpNow(setup.data.secret) }, jar);
  check(
    'totp-confirm issues 10 backup codes',
    confirm.status === 200 && Array.isArray(confirm.data.backupCodes) && confirm.data.backupCodes.length === 10,
    `got ${confirm.data.backupCodes?.length ?? 0}`
  );

  const codes = confirm.data.backupCodes ?? [];
  const use1 = await post({ mode: 'login', email: EMAIL, verifier: await pbkdf2Hex(PASSWORD, await saltOf(EMAIL)), totpCode: codes[0] }, {});
  check('login with a backup code', use1.status === 200 && use1.data.authenticated === true, use1.data?.error || '');

  const use2 = await post({ mode: 'login', email: EMAIL, verifier: await pbkdf2Hex(PASSWORD, await saltOf(EMAIL)), totpCode: codes[0] }, {});
  check('same backup code REJECTED (single-use)', use2.status === 401, use2.data?.error || '');

  const use3 = await post({ mode: 'login', email: EMAIL, verifier: await pbkdf2Hex(PASSWORD, await saltOf(EMAIL)), totpCode: totpNow(setup.data.secret) }, {});
  check('TOTP still works after backup use', use3.status === 200, use3.data?.error || '');

  const use4 = await post({ mode: 'login', email: EMAIL, verifier: await pbkdf2Hex(PASSWORD, await saltOf(EMAIL)), totpCode: codes[1].toLowerCase().replace('-', '') }, {});
  check('backup code without dash still accepted (normalized)', use4.status === 200, use4.data?.error || '');

  console.log(`\nBackup-codes E2E against ${BASE}\n`);
  console.log(out.join('\n'));
})();
