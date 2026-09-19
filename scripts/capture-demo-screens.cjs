/* ═══════════════════════════════════════════════════════════════
   Demo screenshots — captures docs/DEMO-VIDEO.md scenes into images/.

   Drives headless Edge through the real app (dark mode, 1920×1080),
   registers a throwaway probe account on the LOCAL file backend,
   and screenshots each scene of the demo script.

   Usage: node scripts/capture-demo-screens.cjs [base-url]
   Output: images/*.png    Repo: github.com/abhinavdatta
   ═══════════════════════════════════════════════════════════════ */

const puppeteer = require('puppeteer-core');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const OUT = 'images';
const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const EMAIL = `shots-${Date.now()}@lmcc-test.invalid`;
const PASSWORD = 'Shots-Probe-2026';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, fullPage = false) {
  await sleep(900); // settle animations
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`  ✓ ${name}.png`);
}

async function navTo(page, label, expectText) {
  await page.evaluate((l) => {
    const el = [...document.querySelectorAll('button, a')].find(
      (e) => e.textContent?.trim().toLowerCase().startsWith(l.toLowerCase())
    );
    if (!el) throw new Error('nav not found: ' + l);
    el.click();
  }, label);
  if (expectText) {
    await page.waitForFunction(
      (t) => document.body.textContent.includes(t),
      { timeout: 20000 },
      expectText
    );
  }
  await sleep(600);
}

async function clickByText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim().includes(t));
      if (el) { el.click(); return true; }
      return false;
    },
    selector, text
  );
  if (!ok) throw new Error(`Not found: <${selector}> "${text}"`);
}

async function typeByPlaceholder(page, placeholder, value) {
  await page.evaluate((p) => {
    const el = document.querySelector(`input[placeholder="${p}"]`);
    if (!el) throw new Error('no input ' + p);
    el.focus();
  }, placeholder);
  await page.keyboard.type(value, { delay: 8 });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : EDGE,
    headless: true,
    userDataDir: `C:/Users/abhi0/AppData/Local/Temp/lmcc-shots-${Date.now()}`,
    args: ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', '--force-device-scale-factor=1', '--hide-scrollbars'],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();

  /* ── Scene 2a: Sign-up panel with role selector ── */
  console.log('Scene 2: auth + security UI');
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });

  const needsAuth = await page.evaluate(() => !!document.querySelector('input[placeholder="Work email"]'));
  if (needsAuth) {
    await clickByText(page, '[role="tab"]', 'Create Account');
    await typeByPlaceholder(page, 'Full name', 'Demo Operator');
    await typeByPlaceholder(page, 'Employee ID (e.g. EMP-042)', 'EMP-DEMO');
    await typeByPlaceholder(page, 'Work email', EMAIL);
    await typeByPlaceholder(page, 'Password (8+ chars, letter + number)', PASSWORD);
    await shot(page, 'scene-2-signup-roles');
    // Submit the SIGNUP form (the submit button shares its label with the
    // tab, so target the form's submit button explicitly).
    await page.evaluate(() => {
      const btn = document.querySelector('form button[type="submit"]');
      if (btn) btn.click();
      else throw new Error('no submit button');
    });
    await page
      .waitForFunction(
        () => !document.querySelector('input[placeholder="Work email"]') || document.body.textContent.includes('Dashboard'),
        { timeout: 30000 }
      )
      .catch(async () => {
        const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
        throw new Error('Login did not complete. Page says: ' + text.replace(/\n/g, ' | '));
      });
  }

  /* Dark mode for all captures */
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  });

  /* ── Scene 1: Dashboard ── */
  console.log('Scene 1: dashboard');
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await shot(page, 'scene-1-dashboard');

  /* ── Scene 2b: Account Security (2FA + backup codes section) ── */
  await navTo(page, 'Settings', 'Account Security');
  await shot(page, 'scene-2-account-security');

  /* ── Scene 3: Upload mode + hybrid default + console ── */
  console.log('Scene 3: hybrid scan');
  await navTo(page, 'Scan Product', 'Select Scan Mode');
  await clickByText(page, 'button', 'Upload Mode');
  await page.waitForFunction(() => document.body.textContent.includes('Built-in default active'), { timeout: 20000 });
  await sleep(400);
  await shot(page, 'scene-3-mode-hybrid-builtin', true);

  /* Upload the real sample label and run the scan */
  const input = await page.$('input[type="file"]');
  await input.uploadFile('training/images/sample.jpg');
  await page
    .waitForFunction(
      () => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Run Compliance Check'));
        return btn && !btn.disabled;
      },
      { timeout: 30000 }
    )
    .catch(() => {});
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Run Compliance Check'));
    if (!btn || btn.disabled) throw new Error('Run Compliance Check not enabled — upload failed');
    btn.click();
  });
  await sleep(1500); // progress steps + console starting
  await shot(page, 'scene-3-scan-start', true);
  await sleep(6500); // local OCR + console lines accumulate
  await shot(page, 'scene-3-scan-console', true);

  /* ── Scene 5: History + Product Audit ── */
  console.log('Scene 5: history + audit');
  await navTo(page, 'Scan History', 'Scan History');
  await shot(page, 'scene-5-scan-history');
  await navTo(page, 'Product Audit', 'Product Audit');
  await shot(page, 'scene-5-product-audit');

  /* ── Scene 4: compliance report + PDF-ready view ── */
  console.log('Scene 4: report');
  // The report opens from a scan row in Scan History (eye icon / row click).
  await navTo(page, 'Scan History', 'Scan History');
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="View report"]');
    if (btn) btn.click();
    else throw new Error('no View report button');
  });
  await page.waitForFunction(() => document.body.textContent.includes('Compliance Report'), { timeout: 20000 });
  await sleep(600);
  await shot(page, 'scene-4-compliance-report');

  /* ── Scene 6: AI Providers (stack shot) + console egg for the close ── */
  await navTo(page, 'AI Providers', 'AI Providers Configuration');
  await shot(page, 'scene-6-ai-providers');

  await browser.close();
  console.log(`\nDone → ${OUT}/ (${fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length} screenshots)`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
