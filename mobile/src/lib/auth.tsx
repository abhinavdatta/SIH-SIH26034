// ═══════════════════════════════════════════════════════════════
// Auth — session context backed by the server (/api/auth).
//
// React Native port of the web AuthProvider. Same protocol: the
// password never leaves the device raw (PBKDF2 verifier derived
// locally, see auth-crypto.ts); the session rides the server's
// httpOnly cookie, held by the OS cookie jar. Accounts and scans live
// server-side, so the same login works from the web app AND this
// native app — history syncs across both.
//
// The signed-in identity stamps every export (PDF, CSV).
//
// Ported from the LMCC web app. Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  prepareLogin,
  prepareRegister,
  prepareReset,
  prepareChangePassword,
  AuthServerError,
  type LoginRequest,
  type RegisterRequest,
} from './auth-crypto';
import { apiJson, unreachableError } from './api';
import { localStore } from './storage';
import { clearLocalScanCache } from './local-data';
import { startScanSync, stopScanSync } from './scan-sync';

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
  /** Begin authenticator setup — secret, otpauth:// URI, and server-generated QR data URL. */
  beginTotpSetup: () => Promise<{ ok: boolean; secret?: string; otpauthUrl?: string; qrDataUrl?: string; error?: string }>;
  /** Verify a code against the pending secret, switch 2FA on, and issue
   * ten single-use backup codes (shown once). */
  confirmTotp: (code: string) => Promise<{ ok: boolean; backupCodes?: string[]; error?: string }>;
  /** Turn 2FA off (requires the current password). */
  disableTotp: (password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Change the signed-in account's password (requires the current one). */
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
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
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const who = currentUser
    ? `${currentUser.name}${currentUser.employeeId ? ` (${currentUser.employeeId})` : ''} <${currentUser.email}>`
    : 'Unknown user';
  return `Exported by: ${who} — ${when} via LMCC Mobile`;
}

/** Stamp for filenames/headers where angle brackets are awkward. */
export function getExportStampShort(): string {
  const who = currentUser
    ? `${currentUser.name}${currentUser.employeeId ? ` (${currentUser.employeeId})` : ''}`
    : 'Unknown user';
  return `${who} · ${currentUser?.email ?? 'no-session'} · ${new Date().toISOString()}`;
}

export const REPO_URL = 'https://github.com/abhinavdatta';
export const WATERMARK_LINE = 'github.com/abhinavdatta';

/* ── Provider ── */

interface SessionResponse {
  authenticated: boolean;
  user?: AuthUser;
  persistent?: boolean;
  officerRegistration?: boolean;
  totpEnabled?: boolean;
  hasSecurityAnswers?: boolean;
  error?: string;
}

async function fetchSession(): Promise<SessionResponse> {
  const { ok, data } = await apiJson<SessionResponse>('/api/auth');
  if (!ok && !data.authenticated) {
    return data && typeof data === 'object' && Object.keys(data).length > 0 ? data : { authenticated: false };
  }
  return data;
}

/** Password rules enforced identically on the panel and here pre-hash. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter';
  if (!/\d/.test(password)) return 'Password must contain a number';
  return null;
}

const EMPTY: AuthState = {
  user: null,
  hydrated: false,
  persistent: false,
  officerRegistration: false,
  totpEnabled: false,
  hasSecurityAnswers: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY);

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
      applySession(data);
    });
    // Legacy local-account cleanup (pre-server auth) — remove stale keys.
    try {
      localStore.removeItem('lmcc-users');
      localStore.removeItem('lmcc-session');
    } catch {
      // Ignore
    }
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refresh,
      signIn: async (email, password, totpCode) => {
        let payload: LoginRequest;
        try {
          payload = await prepareLogin(email, password, totpCode);
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : unreachableError() };
        }
        const { ok, data } = await apiJson<SessionResponse & { totpRequired?: boolean }>('/api/auth', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!ok || !data.authenticated) {
          return {
            ok: false,
            error: data.error ?? 'Invalid email or password',
            totpRequired: data.totpRequired === true,
          };
        }
        applySession(data);
        // Pull this account's scans onto the device (cross-device sync).
        startScanSync();
        return { ok: true };
      },
      signUp: async (input) => {
        const pwError = validatePassword(input.password);
        if (pwError) return { ok: false, error: pwError };
        let payload: RegisterRequest;
        try {
          payload = await prepareRegister(input);
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : unreachableError() };
        }
        const { ok, data } = await apiJson<SessionResponse>('/api/auth', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!ok || !data.authenticated) {
          return { ok: false, error: data.error ?? 'Could not create the account' };
        }
        applySession(data);
        startScanSync();
        return { ok: true };
      },
      signOut: async () => {
        await apiJson('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ mode: 'logout' }),
        });
        // Shared-device privacy: wipe this account's data from the app
        // (it stays on the server and re-hydrates on next sign-in).
        try {
          clearLocalScanCache();
          stopScanSync();
          localStore.removeItem('lmcc-users');
          localStore.removeItem('lmcc-session');
        } catch {
          // Best effort
        }
        currentUser = null;
        setState({ ...EMPTY, hydrated: true, persistent: state.persistent, officerRegistration: state.officerRegistration });
      },

      startForgotPassword: async (email) => {
        const { ok, data } = await apiJson<{ ticket?: string; questions?: string[]; error?: string }>('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ mode: 'forgot-start', email }),
        });
        if (!ok || !data.ticket || !data.questions) {
          return { ok: false, error: data.error ?? unreachableError() };
        }
        return { ok: true, ticket: data.ticket, questions: data.questions };
      },

      completeReset: async (email, ticket, _questions, answers, newPassword) => {
        const pwError = validatePassword(newPassword);
        if (pwError) return { ok: false, error: pwError };
        let payload;
        try {
          payload = await prepareReset(email, newPassword, answers, ticket);
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : unreachableError() };
        }
        const { ok, data } = await apiJson<SessionResponse>('/api/auth', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!ok || !data.authenticated) {
          return { ok: false, error: data.error ?? 'Reset failed' };
        }
        applySession(data);
        startScanSync();
        return { ok: true };
      },

      saveSecurityAnswers: async (answers) => {
        const { ok, data } = await apiJson<{ ok?: boolean; error?: string }>('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ mode: 'security-save', a1: answers[0] ?? '', a2: answers[1] ?? '', a3: answers[2] ?? '' }),
        });
        if (!ok || !data.ok) return { ok: false, error: data.error ?? 'Could not save' };
        setState((s) => ({ ...s, hasSecurityAnswers: true }));
        return { ok: true };
      },

      beginTotpSetup: async () => {
        const { ok, data } = await apiJson<{ secret?: string; otpauthUrl?: string; qrDataUrl?: string; error?: string }>('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ mode: 'totp-setup' }),
        });
        if (!ok || !data.secret || !data.otpauthUrl) {
          return { ok: false, error: data.error ?? unreachableError() };
        }
        return { ok: true, secret: data.secret, otpauthUrl: data.otpauthUrl, qrDataUrl: data.qrDataUrl };
      },

      confirmTotp: async (code) => {
        const { ok, data } = await apiJson<{ ok?: boolean; backupCodes?: string[]; error?: string }>('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ mode: 'totp-confirm', code }),
        });
        if (!ok || !data.ok) return { ok: false, error: data.error ?? 'Could not confirm' };
        setState((s) => ({ ...s, totpEnabled: true }));
        return { ok: true, backupCodes: data.backupCodes };
      },

      disableTotp: async (password) => {
        let verifier: string;
        try {
          const payload = await prepareLogin(state.user?.email ?? '', password);
          verifier = payload.verifier;
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : unreachableError() };
        }
        const { ok, data } = await apiJson<{ ok?: boolean; error?: string }>('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ mode: 'totp-disable', verifier }),
        });
        if (!ok || !data.ok) return { ok: false, error: data.error ?? 'Could not disable 2FA' };
        setState((s) => ({ ...s, totpEnabled: false }));
        return { ok: true };
      },

      changePassword: async (currentPassword, newPassword) => {
        const pwError = validatePassword(newPassword);
        if (pwError) return { ok: false, error: pwError };
        if (currentPassword === newPassword) {
          return { ok: false, error: 'New password must be different from the current one' };
        }
        let payload;
        try {
          payload = await prepareChangePassword(state.user?.email ?? '', currentPassword, newPassword);
        } catch (err) {
          return { ok: false, error: err instanceof AuthServerError ? err.message : unreachableError() };
        }
        const { ok, data } = await apiJson<SessionResponse>('/api/auth', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!ok) {
          return { ok: false, error: data.error ?? 'Could not change the password' };
        }
        // Server re-issued this device's session; update identity in place.
        applySession(data);
        return { ok: true };
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
