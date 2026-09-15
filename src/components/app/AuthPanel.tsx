/* ═══════════════════════════════════════════════════════════════════════════
   Auth Panel — server-backed sign in / sign up with role selection,
   forgot-password reset via security questions, and authenticator-app 2FA.
   Accounts live server-side → the same login works from any device.
   Raw passwords never leave the browser: a PBKDF2-SHA256 (150k iterations)
   verifier is derived locally and only that is transmitted, so the network
   tab never shows the password.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import {
  Shield,
  Loader2,
  Mail,
  Lock,
  User,
  BadgeCheck,
  AlertCircle,
  Store,
  ShieldCheck,
  Check,
  KeyRound,
  HelpCircle,
  ArrowLeft,
  Smartphone,
} from 'lucide-react';
import { useAuth, ROLE_LABELS, type UserRole, validatePassword } from '@/lib/auth';
import { WATERMARK_LINE } from '@/lib/auth';

type Mode = 'signin' | 'signup' | 'forgot';

const ROLE_OPTIONS: { value: UserRole; icon: React.ReactNode; blurb: string }[] = [
  { value: 'seller', icon: <Store className="h-4 w-4" />, blurb: 'Upload & audit products' },
  { value: 'compliance_officer', icon: <ShieldCheck className="h-4 w-4" />, blurb: 'Full access: review queue, all scans, administration' },
];

export default function AuthPanel() {
  const { signIn, signUp, startForgotPassword, completeReset, persistent, hydrated, officerRegistration } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<UserRole>('seller');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 2FA: shown after the server replies totpRequired on sign-in.
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  // Forgot-password flow state: email → questions+answers+new password → done.
  const [forgotStep, setForgotStep] = useState<'email' | 'questions' | 'done'>('email');
  const [forgotTicket, setForgotTicket] = useState('');
  const [forgotQuestions, setForgotQuestions] = useState<string[]>([]);
  const [forgotAnswers, setForgotAnswers] = useState<string[]>(['', '', '']);
  const [newPassword, setNewPassword] = useState('');

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setTotpRequired(false);
    setTotpCode('');
    if (next === 'forgot') {
      setForgotStep('email');
      setForgotTicket('');
      setForgotQuestions([]);
      setForgotAnswers(['', '', '']);
      setNewPassword('');
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await signIn(email, password, totpRequired ? totpCode : undefined);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong');
        if (result.totpRequired) setTotpRequired(true);
        else setTotpRequired(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Enter the email on your account');
    setBusy(true);
    try {
      const result = await startForgotPassword(email);
      if (!result.ok || !result.ticket || !result.questions) {
        setError(result.error ?? 'Could not start the reset');
        return;
      }
      setForgotTicket(result.ticket);
      setForgotQuestions(result.questions);
      setForgotStep('questions');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pw = validatePassword(newPassword);
    if (pw) return setError(pw);
    if (forgotAnswers.some((a) => a.trim().length === 0)) return setError('Answer all three questions');
    setBusy(true);
    try {
      const result = await completeReset(email, forgotTicket, forgotQuestions, forgotAnswers, newPassword);
      if (!result.ok) {
        setError(result.error ?? 'Reset failed');
        return;
      }
      setForgotStep('done');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'forgot') {
      if (forgotStep === 'email') return handleForgotStart(e);
      if (forgotStep === 'questions') return handleForgotReset(e);
      return;
    }
    if (mode === 'signin') return handleSignIn(e);

    // signup
    if (name.trim().length < 2) return setError('Please enter your full name');
    const pw = validatePassword(password);
    if (pw) return setError(pw);
    if (role === 'compliance_officer' && !inviteCode.trim()) {
      return setError('An invite code is required to register as a Compliance Officer');
    }

    setBusy(true);
    try {
      const result = await signUp({ name, email, employeeId, role, inviteCode, password });
      if (!result.ok) setError(result.error ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'input-base input-icon w-full text-sm';
  const isForgot = mode === 'forgot';

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

          {/* Mode tabs (hidden mid-reset; a back arrow replaces them) */}
          {!(isForgot && forgotStep === 'questions') && (
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
                  onClick={() => switchMode(m)}
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
          )}

          {isForgot && forgotStep === 'questions' && (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="flex items-center gap-1.5 text-xs font-medium mb-4 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Start over
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* ── Sign-in ── */}
            {mode === 'signin' && (
              <>
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
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    autoComplete="current-password"
                    aria-label="Password"
                    required
                  />
                </div>
                {totpRequired && (
                  <div className="relative">
                    <Smartphone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--primary)' }} aria-hidden="true" />
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="6-digit authenticator code"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      className={inputClass}
                      autoComplete="one-time-code"
                      aria-label="Authenticator code"
                      autoFocus
                      required
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Sign-up ── */}
            {mode === 'signup' && (
              <>
                {/* Role picker — officer requires an invite code (validated
                    server-side; the client hint is convenience only). */}
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    I am signing up as <span style={{ color: 'var(--danger)' }}>*</span>
                  </p>
                  <div className="space-y-2">
                    {ROLE_OPTIONS.map((option) => {
                      const disabled = option.value === 'compliance_officer' && !officerRegistration && hydrated;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setRole(option.value)}
                          disabled={disabled}
                          title={disabled ? 'Officer registration is not enabled on this deployment' : undefined}
                          className={`w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border-2 text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
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
                              {option.value === 'compliance_officer' && !officerRegistration && hydrated
                                ? 'Invite-only on this deployment — disabled'
                                : option.blurb}
                            </span>
                          </span>
                          {role === option.value && (
                            <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {role === 'compliance_officer' && officerRegistration && (
                  <div className="relative">
                    <KeyRound className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                    <input
                      type="password"
                      placeholder="Officer invite code"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className={inputClass}
                      autoComplete="off"
                      aria-label="Officer invite code"
                    />
                  </div>
                )}

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
                    placeholder="Password (8+ chars, letter + number)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    autoComplete="new-password"
                    aria-label="Password"
                    required
                  />
                </div>
              </>
            )}

            {/* ── Forgot: step 1 — identify the account ── */}
            {isForgot && forgotStep === 'email' && (
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                <input
                  type="email"
                  placeholder="Your account email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  autoComplete="email"
                  aria-label="Account email"
                  required
                />
              </div>
            )}

            {/* ── Forgot: step 2 — answer questions + new password ── */}
            {isForgot && forgotStep === 'questions' && (
              <>
                {forgotQuestions.map((q, i) => (
                  <div key={q} className="relative">
                    <HelpCircle className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                    <input
                      type="text"
                      placeholder={q}
                      value={forgotAnswers[i] ?? ''}
                      onChange={(e) => {
                        const next = [...forgotAnswers];
                        next[i] = e.target.value;
                        setForgotAnswers(next);
                      }}
                      className={inputClass}
                      autoComplete="off"
                      aria-label={q}
                      required
                    />
                  </div>
                ))}
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  <input
                    type="password"
                    placeholder="New password (8+ chars, letter + number)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                    autoComplete="new-password"
                    aria-label="New password"
                    required
                  />
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Answers are case-insensitive and ignore extra spaces. You have 5 attempts before the reset locks.
                </p>
              </>
            )}

            {/* ── Forgot: done ── */}
            {isForgot && forgotStep === 'done' && (
              <div
                className="text-[12px] p-3 rounded-[var(--radius-sm)]"
                style={{ color: 'var(--success, #16a34a)', background: 'var(--bg-secondary)' }}
                role="status"
              >
                Password reset — you&apos;re signed in on this device. Other devices that were signed in have been
                logged out for safety. Use your new password next time.
              </div>
            )}

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

            {!(isForgot && forgotStep === 'done') && (
              <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === 'signin' ? (
                  totpRequired ? 'Verify & Sign In' : 'Sign In'
                ) : mode === 'signup' ? (
                  'Create Account'
                ) : forgotStep === 'email' ? (
                  'Start Password Reset'
                ) : (
                  'Reset Password'
                )}
              </button>
            )}
          </form>

          {/* Forgot-password link under the sign-in form */}
          {mode === 'signin' && !totpRequired && (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="text-[11px] font-medium mt-3 cursor-pointer"
              style={{ color: 'var(--primary)' }}
            >
              Forgot password?
            </button>
          )}
          {isForgot && forgotStep === 'done' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="btn-primary w-full py-2.5 mt-3"
            >
              Continue to Sign In
            </button>
          )}

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
