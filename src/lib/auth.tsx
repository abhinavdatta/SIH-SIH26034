// ═══════════════════════════════════════════════════════════════
// Auth — session context backed by the server (/api/auth).
//
// Cross-device by design: accounts and sessions live server-side
// (Upstash Redis when configured), so the same login works from any
// browser or machine. Passwords never leave the device raw — the
// AuthPanel derives a PBKDF2 verifier locally (see auth-crypto.ts);
// the server stores only scrypt(verifier). PII is AES-256-GCM
// encrypted at rest and sessions ride httpOnly cookies, invisible
// to JavaScript and to network-tab payload inspection.
//
// The signed-in identity stamps every export (PDF, CSV, training ZIP).
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  prepareLogin,
  prepareRegister,
  prepareReset,
  AuthServerError,
  type LoginRequest,
  type RegisterRequest,
} from './auth-crypto';

export type UserRole = 'seller' | 'compliance_officer';

export interface AuthUser {
  name: string;
  email: string;
  employeeId: string;
  role: UserRole;
}

export interface AuthState {
  user: AuthUser | null;
  /** True after the first /api/auth round-trip resolves. */
  hydrated: boolean;
  /** Server reports a persistent backend (cross-device accounts ready). */
  persistent: boolean;
  /** Officer sign-up is possible on this deployment (invite codes configured server-side). */
  officerRegistration: boolean;
  /** Authenticator 2FA is active for the signed-in account. */
  totpEnabled: boolean;
  /** Security questions are configured for the signed-in account. */
  hasSecurityAnswers: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string, totpCode?: string) => Promise<{ ok: boolean; error?: string; totpRequired?: boolean }>;
  signUp: (input: { name: string; email: string; employeeId: string; role: UserRole; inviteCode?: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Begin a password reset — returns the ticket + the three questions. */
  startForgotPassword: (email: string) => Promise<{ ok: boolean; ticket?: string; questions?: string[]; error?: string }>;
  /** Complete a password reset (correct answers → signed in on the spot). */
  completeReset: (email: string, ticket: string, questions: string[], answers: string[], newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  /** Save/replace the account's security-question answers. */
  saveSecurityAnswers: (answers: string[]) => Promise<{ ok: boolean; error?: string }>;
  /** Begin authenticator setup — secret + otpauth:// URI for the QR code. */
  beginTotpSetup: () => Promise<{ ok: boolean; secret?: string; otpauthUrl?: string; error?: string }>;
  /** Verify a code against the pending secret and switch 2FA on. */
  confirmTotp: (code: string) => Promise<{ ok: boolean; error?: string }>;
  /** Turn 2FA off (requires the current password). */
  disableTotp: (password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Whether this account currently has TOTP enabled. */
  totpEnabled: boolean;
  /** Whether this account has security questions configured. */
  hasSecurityAnswers: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Export stamps (module-level current user, set by the provider) ── */

let currentUser: AuthUser | null = null;

export const ROLE_LABELS: Record<UserRole, string> = {
  seller: 'Seller — Upload & Audit Products',
  compliance_officer: 'Compliance Officer / Admin',
};

/**
 * One-line identity provenance for exports, e.g.:
 * "Exported by: Priya Sharma (EMP-042, priya@company.in) — 2026-09-13 14:05 IST via LMCC"
 */
export function getExportStamp(): string {
  const when = new Date().toLocaleString('en-IN', { hour12: false });
  const who = currentUser
    ? `${currentUser.name}${currentUser.employeeId ? ` (${currentUser.employeeId})` : ''} <${currentUser.email}>`
    : 'Unknown user';
  return `Exported by: ${who} — ${when} via LMCC`;
}

/** Stamp for filenames/headers where angle brackets are awkward. */
export function getExportStampShort(): string {
  const who = currentUser
    ? `${currentUser.name}${currentUser.employeeId ? ` (${currentUser.employeeId})` : ''}`
    : 'Unknown user';
  return `${who} · ${currentUser?.email ?? 'no-session'} · ${new Date().toISOString()}`;
}

/* ── Repo watermark ── */

export const REPO_URL = 'https://github.com/abhinavdatta';
export const WATERMARK_LINE = 'github.com/abhinavdatta';

/* ── Provider ── */

interface SessionResponse {
  authenticated: boolean;
  user?: AuthUser;
  persistent?: boolean;
  /** Whether officer registration is open on this deployment (invite codes configured). */
  officerRegistration?: boolean;
  /** 2FA state for the signed-in account. */
  totpEnabled?: boolean;
  /** Security questions configured for the signed-in account. */
  hasSecurityAnswers?: boolean;
  error?: string;
}

async function fetchSession(): Promise<SessionResponse> {
  try {
    const res = await fetch('/api/auth', { cache: 'no-store' });
    return (await res.json()) as SessionResponse;
  } catch {
    return { authenticated: false };
  }
}

/** Password rules enforced identically on the panel and here pre-hash. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter';
  if (!/\d/.test(password)) return 'Password must contain a number';
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    hydrated: false,
    persistent: false,
    officerRegistration: false,
    totpEnabled: false,
    hasSecurityAnswers: false,
  });

  const applySession = useMemo(
    () => (data: SessionResponse) => {
      currentUser = data.authenticated && data.user ? data.user : null;
      setState({
        user: currentUser,
        hydrated: true,
        persistent: Boolean(data.persistent),
        officerRegistration: Boolean(data.officerRegistration),
        totpEnabled: Boolean(data.totpEnabled),
        hasSecurityAnswers: Boolean(data.hasSecurityAnswers),
      });
    },
    []
  );

  const refresh = useMemo(
    () => async () => {
      applySession(await fetchSession());
    },
    [applySession]
  );

  useEffect(() => {
    let cancelled = false;
    fetchSession().then((data) => {
      if (cancelled) return;
      currentUser = data.authenticated && data.user ? data.user : null;
      setState({
        user: currentUser,
        hydrated: true,
        persistent: Boolean(data.persistent),
        officerRegistration: Boolean(data.officerRegistration),
        totpEnabled: Boolean(data.totpEnabled),
        hasSecurityAnswers: Boolean(data.hasSecurityAnswers),
      });
    });
    // Legacy local-account cleanup (pre-server auth) — remove stale keys.
    try {
      window.localStorage.removeItem('lmcc-users');
      window.localStorage.removeItem('lmcc-session');
    } catch {
      // Ignore
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refresh,
      signIn: async (email, password, totpCode) => {
        let payload: LoginRequest;
        try {
          payload = await prepareLogin(email, password, totpCode);
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : 'Could not reach the auth service' };
        }
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = (await res.json().catch(() => ({}))) as SessionResponse;
          if (!res.ok || !data.authenticated) {
            // Surface the server's actual reason (e.g. the 503 setup guidance,
            // or totpRequired when the account has 2FA on) instead of a
            // generic network-failure message.
            return {
              ok: false,
              error: data.error ?? 'Invalid email or password',
              totpRequired: (data as { totpRequired?: boolean }).totpRequired === true,
            };
          }
          applySession(data);
          // Pull this account's scans onto the device (cross-device sync).
          void import('./scan-sync').then(({ startScanSync }) => startScanSync());
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },
      signUp: async (input) => {
        const pwError = validatePassword(input.password);
        if (pwError) return { ok: false, error: pwError };
        let payload: RegisterRequest;
        try {
          payload = await prepareRegister(input);
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : 'Could not reach the auth service' };
        }
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = (await res.json().catch(() => ({}))) as SessionResponse;
          if (!res.ok || !data.authenticated) {
            return { ok: false, error: data.error ?? 'Could not create the account' };
          }
          applySession(data);
          void import('./scan-sync').then(({ startScanSync }) => startScanSync());
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },
      signOut: async () => {
        try {
          await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'logout' }),
          });
        } catch {
          // Session expires server-side anyway
        }
        // Shared-device privacy: wipe this account's data from the browser
        // (it stays on the server and re-hydrates on next sign-in).
        try {
          const { clearLocalScanCache } = await import('./local-data');
          clearLocalScanCache();
          const { clearTrainingPairs } = await import('./training-samples');
          await clearTrainingPairs();
          const { stopScanSync } = await import('./scan-sync');
          stopScanSync();
        } catch {
          // Best effort
        }
        currentUser = null;
        setState({ user: null, hydrated: true, persistent: state.persistent, officerRegistration: state.officerRegistration, totpEnabled: false, hasSecurityAnswers: false });
      },

      startForgotPassword: async (email) => {
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'forgot-start', email }),
          });
          const data = (await res.json().catch(() => ({}))) as { ticket?: string; questions?: string[]; error?: string };
          if (!res.ok || !data.ticket || !data.questions) {
            return { ok: false, error: data.error ?? 'Could not start the reset' };
          }
          return { ok: true, ticket: data.ticket, questions: data.questions };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },

      completeReset: async (email, ticket, questions, answers, newPassword) => {
        const pwError = validatePassword(newPassword);
        if (pwError) return { ok: false, error: pwError };
        let payload;
        try {
          payload = await prepareReset(email, newPassword, answers, ticket);
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : 'Could not reach the auth service' };
        }
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = (await res.json().catch(() => ({}))) as SessionResponse;
          if (!res.ok || !data.authenticated) {
            return { ok: false, error: data.error ?? 'Reset failed' };
          }
          applySession(data);
          void import('./scan-sync').then(({ startScanSync }) => startScanSync());
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },

      saveSecurityAnswers: async (answers) => {
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'security-save', a1: answers[0] ?? '', a2: answers[1] ?? '', a3: answers[2] ?? '' }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'Could not save' };
          setState((s) => ({ ...s, hasSecurityAnswers: true }));
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },

      beginTotpSetup: async () => {
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'totp-setup' }),
          });
          const data = (await res.json().catch(() => ({}))) as { secret?: string; otpauthUrl?: string; error?: string };
          if (!res.ok || !data.secret || !data.otpauthUrl) {
            return { ok: false, error: data.error ?? 'Could not start 2FA setup' };
          }
          return { ok: true, secret: data.secret, otpauthUrl: data.otpauthUrl };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },

      confirmTotp: async (code) => {
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'totp-confirm', code }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'Could not confirm' };
          setState((s) => ({ ...s, totpEnabled: true }));
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },

      disableTotp: async (password) => {
        let verifier: string;
        try {
          const payload = await prepareLogin(state.user?.email ?? '', password);
          verifier = payload.verifier;
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : 'Could not reach the auth service' };
        }
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'totp-disable', verifier }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'Could not disable 2FA' };
          setState((s) => ({ ...s, totpEnabled: false }));
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not reach the auth service' };
        }
      },
    }),
    [state, applySession, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
