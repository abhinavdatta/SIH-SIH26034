/* ═══════════════════════════════════════════════════════════════════════════
   Account Security — security questions (password recovery) and
   authenticator-app 2FA (TOTP) management for the signed-in account.

   Lives inside Settings → Account. TOTP setup shows the secret for
   manual entry into any authenticator app (Google/Microsoft/Authy/
   Aegis/1Password) plus the otpauth:// URI — deliberately QR-free so
   no third-party image service ever sees the secret.

   Repo: github.com/abhinavdatta
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import { Loader2, HelpCircle, Smartphone, ShieldCheck, ShieldOff, Lock, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';

/* ── Security questions section ── */

function SecurityQuestionsSection({ hasSaved }: { hasSaved: boolean }) {
  const { saveSecurityAnswers } = useAuth();
  const [open, setOpen] = useState(!hasSaved);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [busy, setBusy] = useState(false);
  const QUESTIONS = [
    'What was the name of your first school?',
    "What is your mother's maiden name?",
    'What was the model of your first car or bike?',
  ];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (answers.some((a) => a.trim().length < 2)) {
      toast.error('Answer all three questions (at least 2 characters each)');
      return;
    }
    setBusy(true);
    try {
      const result = await saveSecurityAnswers(answers);
      if (result.ok) {
        toast.success('Security questions saved', { description: 'You can now reset a forgotten password from the login page.' });
        setOpen(false);
      } else {
        toast.error('Could not save', { description: result.error });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] p-3" style={{ background: 'var(--bg-secondary)' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Security questions</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {hasSaved ? 'Configured — enables forgot-password on the login page' : 'Not set up — required for password recovery'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost text-[11px] shrink-0">
          {hasSaved ? (open ? 'Hide' : 'Update') : open ? 'Hide' : 'Set up'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSave} className="space-y-2 mt-2">
          {QUESTIONS.map((q, i) => (
            <input
              key={q}
              type="text"
              placeholder={q}
              value={answers[i] ?? ''}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value;
                setAnswers(next);
              }}
              autoComplete="off"
              aria-label={q}
              className="input-base w-full text-xs"
            />
          ))}
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Stored as scrypt hashes — even the server can&apos;t read them. Case-insensitive; extra spaces ignored.
          </p>
          <button type="submit" disabled={busy} className="btn-primary w-full py-1.5 text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Answers'}
          </button>
        </form>
      )}
    </div>
  );
}

/* ── Authenticator 2FA section ── */

function TotpSection({ enabled }: { enabled: boolean }) {
  const { user, beginTotpSetup, confirmTotp, disableTotp } = useAuth();
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qrDataUrl?: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleBegin() {
    setBusy(true);
    try {
      const result = await beginTotpSetup();
      if (result.ok && result.secret && result.otpauthUrl) {
        setSetup({ secret: result.secret, otpauthUrl: result.otpauthUrl, qrDataUrl: result.qrDataUrl });
      } else {
        toast.error('Could not start 2FA setup', { description: result.error });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    setBusy(true);
    try {
      const result = await confirmTotp(code);
      if (result.ok) {
        toast.success('Authenticator 2FA enabled', { description: 'You will be asked for a code on every sign-in.' });
        setOpen(false);
        setSetup(null);
        setCode('');
      } else {
        toast.error('Verification failed', { description: result.error });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await disableTotp(password);
      if (result.ok) {
        toast.info('2FA disabled');
        setOpen(false);
        setPassword('');
      } else {
        toast.error('Could not disable 2FA', { description: result.error });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] p-3" style={{ background: 'var(--bg-secondary)' }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Authenticator app (2FA)</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {enabled ? 'Enabled — a code is required at every sign-in' : 'Off — adds a 6-digit code to sign-in'}
            </p>
          </div>
        </div>
        {enabled ? (
          <button
            type="button"
            onClick={() => { setOpen((o) => !o); setSetup(null); }}
            className="btn-ghost text-[11px] shrink-0"
          >
            {open ? 'Hide' : 'Turn off'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setOpen((o) => !o); setSetup(null); }}
            className="btn-ghost text-[11px] shrink-0"
          >
            {open ? 'Hide' : 'Enable'}
          </button>
        )}
      </div>

      {open && !enabled && !setup && (
        <button type="button" onClick={handleBegin} disabled={busy} className="btn-primary w-full py-1.5 text-xs mt-2">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Start Setup'}
        </button>
      )}

      {open && setup && (
        <div className="mt-3 space-y-3">
          <ol className="text-[11px] space-y-1 list-decimal list-inside" style={{ color: 'var(--text-secondary)' }}>
            <li>Open your authenticator app (Google, Microsoft, Authy, Aegis, 1Password…)</li>
            <li>
              {setup.qrDataUrl
                ? 'Scan this QR code with the app'
                : 'Choose “Add account” → “Enter a setup key” (manual entry)'}
            </li>
            <li>Enter the 6-digit code it shows to finish enabling 2FA</li>
          </ol>
          {setup.qrDataUrl && (
            <div className="flex justify-center p-2">
              {/* Server-generated PNG data URL — no third-party chart/QS service involved. */}
              <img
                src={setup.qrDataUrl}
                alt="Authenticator setup QR code"
                width={180}
                height={180}
                className="rounded-[var(--radius-sm)]"
                style={{ background: '#fff', imageRendering: 'pixelated' }}
              />
            </div>
          )}
          <details className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <summary className="cursor-pointer">Can&apos;t scan? Enter the key manually</summary>
            <div className="p-2.5 mt-1 rounded-[var(--radius-sm)] font-mono text-xs tracking-wider break-all" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
              {setup.secret}
            </div>
            <p className="break-all mt-1 font-mono">{setup.otpauthUrl}</p>
          </details>
          <form onSubmit={handleConfirm} className="flex gap-2">
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoComplete="one-time-code"
              aria-label="Authenticator code"
              className="input-base flex-1 text-xs"
              required
            />
            <button type="submit" disabled={busy} className="btn-primary px-4 text-xs">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Verify'}
            </button>
          </form>
        </div>
      )}

      {open && enabled && (
        <form onSubmit={handleDisable} className="space-y-2 mt-2">
          <div className="relative">
            <Lock className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
            <input
              type="password"
              placeholder="Confirm your password to turn 2FA off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-label="Confirm password"
              className="input-base input-icon w-full text-xs"
              required
            />
          </div>
          <button type="submit" disabled={busy} className="w-full py-1.5 text-xs rounded-[var(--radius-sm)] font-medium" style={{ background: 'var(--danger)', color: '#fff' }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Turn Off 2FA'}
          </button>
        </form>
      )}
    </div>
  );
}

/* ── Card (rendered inside Settings → Account) ── */

export default function AccountSecurityCard() {
  const { user, totpEnabled, hasSecurityAnswers, hydrated } = useAuth();

  if (!hydrated || !user) return null;

  return (
    <div className="rounded-[var(--radius-md)] p-3 border" style={{ borderColor: 'var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4" style={{ color: 'var(--primary)' }} />
        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Account Security</p>
      </div>
      <div className="space-y-2">
        <SecurityQuestionsSection hasSaved={hasSecurityAnswers} />
        <TotpSection enabled={totpEnabled} />
        <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <Check className="h-3 w-3" /> Everything here works across devices — settings live with your account.
        </p>
      </div>
    </div>
  );
}

/* Re-export icons used by parent lists to avoid unused-import lint noise */
export { ShieldOff };
