/* ═══════════════════════════════════════════════════════════════════════════
   Auth Panel — server-backed sign in / sign up with role selection.
   Accounts live server-side → the same login works from any device.
   Raw passwords never leave the browser: a PBKDF2-SHA256 (150k iterations)
   verifier is derived locally and only that is transmitted, so the network
   tab never shows the password.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import { Shield, Loader2, Mail, Lock, User, BadgeCheck, AlertCircle, Store, ShieldCheck, Check } from 'lucide-react';
import { useAuth, ROLE_LABELS, type UserRole, validatePassword } from '@/lib/auth';
import { WATERMARK_LINE } from '@/lib/auth';

type Mode = 'signin' | 'signup';

const ROLE_OPTIONS: { value: UserRole; icon: React.ReactNode; blurb: string }[] = [
  { value: 'seller', icon: <Store className="h-4 w-4" />, blurb: 'Upload & audit products' },
  { value: 'compliance_officer', icon: <ShieldCheck className="h-4 w-4" />, blurb: 'Full access: review queue, all scans, administration' },
];

export default function AuthPanel() {
  const { signIn, signUp, persistent, hydrated } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<UserRole>('seller');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (name.trim().length < 2) return setError('Please enter your full name');
      const pw = validatePassword(password);
      if (pw) return setError(pw);
    }

    setBusy(true);
    try {
      const result =
        mode === 'signup'
          ? await signUp({ name, email, employeeId, role, password })
          : await signIn(email, password);
      if (!result.ok) setError(result.error ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'input-base input-icon w-full text-sm';

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full max-w-md">
        <div className="card-static p-6 sm:p-8">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-11 h-11 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
              style={{ background: 'var(--primary)' }}
            >
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>LMCC</h1>
              <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Legal Metrology Compliance Checker
              </p>
            </div>
          </div>

          {/* Mode tabs */}
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-[var(--radius-md)] mb-5"
            style={{ background: 'var(--bg-secondary)' }}
            role="tablist"
          >
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setError(null); }}
                className="py-2 text-[13px] font-medium rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                style={
                  mode === m
                    ? { background: 'var(--bg-card)', color: 'var(--primary)', boxShadow: 'var(--shadow-sm)' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <>
                {/* Role picker */}
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    I am signing up as <span style={{ color: 'var(--danger)' }}>*</span>
                  </p>
                  <div className="space-y-2">
                    {ROLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRole(option.value)}
                        className={`w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border-2 text-left transition-colors cursor-pointer ${
                          role === option.value ? 'border-[var(--primary)]' : 'border-[var(--border-default)]'
                        }`}
                        style={role === option.value ? { background: 'var(--primary-light)' } : undefined}
                        aria-pressed={role === option.value}
                      >
                        <span style={{ color: role === option.value ? 'var(--primary)' : 'var(--text-muted)' }}>
                          {option.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {ROLE_LABELS[option.value]}
                          </span>
                          <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {option.blurb}
                          </span>
                        </span>
                        {role === option.value && (
                          <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    autoComplete="name"
                    aria-label="Full name"
                    required
                  />
                </div>
                <div className="relative">
                  <BadgeCheck className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Employee ID (e.g. EMP-042)"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className={inputClass}
                    aria-label="Employee ID"
                  />
                </div>
              </>
            )}

            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <input
                type="email"
                placeholder="Work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                autoComplete="email"
                aria-label="Email"
                required
              />
            </div>

            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <input
                type="password"
                placeholder={mode === 'signup' ? 'Password (8+ chars, letter + number)' : 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                aria-label="Password"
                required
              />
            </div>

            {error && (
              <div
                className="flex items-start gap-2 text-[11px] p-2.5 rounded-md"
                style={{ color: 'var(--danger)', background: 'var(--bg-secondary)' }}
                role="alert"
              >
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {mode === 'signup' && (
            <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Your employee ID and email are stamped into every exported PDF, CSV, and training file. Passwords are
              never sent to the server — only a locally-derived cryptographic verifier.
            </p>
          )}
        </div>

        <p className="text-center text-[10px] mt-4" style={{ color: 'var(--text-muted)' }}>
          {hydrated && !persistent ? (
            <span style={{ color: 'var(--warning, #d97706)' }}>
              Server storage: local file (accounts survive restarts on this machine). For
              login-from-anywhere across devices, set UPSTASH_REDIS_REST_URL + TOKEN — see .env.example.
            </span>
          ) : (
            'Same login works on any device.'
          )}{' '}
          <a
            href={`https://${WATERMARK_LINE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--primary)' }}
          >
            {WATERMARK_LINE}
          </a>
        </p>
      </div>
    </div>
  );
}
