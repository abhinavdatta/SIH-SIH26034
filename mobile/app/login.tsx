// ═══════════════════════════════════════════════════════════════
// Login / Register / Forgot password — the mobile auth panel.
//
// Same security model as the web app: the raw password never leaves
// this device (a PBKDF2 verifier is derived locally, 150k iterations),
// accounts live server-side, and 2FA (TOTP or backup code) is asked
// as a second step when enabled. Forgot-password runs through the
// three security questions with a single-use ticket.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth, validatePassword, type UserRole } from '@/lib/auth';
import { getApiBase, setApiBase, hasSavedApiBase, apiJson } from '@/lib/api';
import { unreachableError } from '@/lib/api';
import { C, F, R } from '@/theme';
import {
  Badge,
  Btn,
  BusyOverlay,
  Card,
  ErrorBanner,
  InfoBanner,
  Input,
  Screen,
  Sheet,
  T,
} from '@/components/ui';

type Mode = 'signin' | 'register' | 'forgot';

export default function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Sign in
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpStep, setTotpStep] = useState(false);

  // Register
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<UserRole>('seller');
  const [inviteCode, setInviteCode] = useState('');
  const [confirm, setConfirm] = useState('');

  // Forgot password
  const [ticket, setTicket] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [newPassword, setNewPassword] = useState('');

  // Server URL editor
  const [serverOpen, setServerOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [serverMsg, setServerMsg] = useState<string | null>(null);

  useEffect(() => {
    setServerUrl(getApiBase());
  }, [serverOpen]);

  const modeTabs = useMemo(
    () =>
      ([
        ['signin', 'Sign in'],
        ['register', 'Register'],
        ['forgot', 'Forgot'],
      ] as [Mode, string][]).map(([value, label]) => (
        <Pressable
          key={value}
          onPress={() => {
            setMode(value);
            setError(null);
            setNotice(null);
            setTotpStep(false);
          }}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: R.md,
            alignItems: 'center',
            backgroundColor: mode === value ? C.primary : 'transparent',
          }}
        >
          <T size={F.sm} color={mode === value ? '#FFFFFF' : C.textDim} weight="600">
            {label}
          </T>
        </Pressable>
      )),
    [mode]
  );

  async function doSignIn(withTotp: boolean) {
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setBusy(true);
    const res = await auth.signIn(email.trim(), password, withTotp ? totpCode.trim() || undefined : undefined);
    setBusy(false);
    if (res.ok) {
      router.replace('/(tabs)/dashboard');
      return;
    }
    if (res.totpRequired) {
      setTotpStep(true);
      setNotice('This account has 2FA enabled — enter the 6-digit code from your authenticator app, or a backup code.');
      return;
    }
    setError(res.error ?? unreachableError());
  }

  async function doRegister() {
    setError(null);
    if (name.trim().length < 2) return setError('Please enter your full name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address');
    const pwError = validatePassword(password);
    if (pwError) return setError(pwError);
    if (password !== confirm) return setError('Passwords do not match');
    if (role === 'compliance_officer' && !inviteCode.trim()) {
      return setError('Compliance Officer registration needs an invite code from the deployment admin');
    }
    setBusy(true);
    const res = await auth.signUp({
      name: name.trim(),
      email: email.trim(),
      employeeId: employeeId.trim(),
      role,
      inviteCode: inviteCode.trim() || undefined,
      password,
    });
    setBusy(false);
    if (res.ok) {
      router.replace('/(tabs)/dashboard');
      return;
    }
    setError(res.error ?? 'Could not create the account');
  }

  async function doForgotStart() {
    setError(null);
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address');
    setBusy(true);
    const res = await auth.startForgotPassword(email.trim().toLowerCase());
    setBusy(false);
    if (res.ok && res.ticket && res.questions) {
      setTicket(res.ticket);
      setQuestions(res.questions);
      setAnswers(['', '', '']);
      setNotice('Answer your security questions to set a new password. The ticket expires in 15 minutes.');
    } else {
      setError(res.error ?? unreachableError());
    }
  }

  async function doForgotReset() {
    setError(null);
    const pwError = validatePassword(newPassword);
    if (pwError) return setError(pwError);
    if (answers.some((a) => a.trim().length < 2)) return setError('Answer all three questions (2+ characters each)');
    if (!ticket) return setError('Start again — the reset ticket is missing');
    setBusy(true);
    const res = await auth.completeReset(email.trim().toLowerCase(), ticket, questions, answers, newPassword);
    setBusy(false);
    if (res.ok) {
      router.replace('/(tabs)/dashboard');
      return;
    }
    setError(res.error ?? 'Reset failed');
  }

  async function doSaveServer() {
    setServerMsg(null);
    const ok = await setApiBase(serverUrl.trim());
    if (!ok) {
      setServerMsg('Enter a full URL like http://192.168.1.10:3000');
      return;
    }
    const { ok: reachable } = await apiJson<{ authenticated?: boolean }>('/api/auth');
    setServerMsg(reachable ? 'Saved — server reachable.' : 'Saved, but the server did not respond. Check the URL and that the backend is running.');
  }

  return (
    <Screen scroll>
      {/* Header */}
      <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 22 }}>
        <T size={44}>⚖️</T>
        <T size={F.xxl} weight="700" style={{ marginTop: 8 }}>
          LMCC
        </T>
        <T size={F.sm} color={C.textDim} align="center" style={{ marginTop: 4 }}>
          Legal Metrology Compliance Checker
        </T>
        {!auth.persistent ? (
          <View style={{ marginTop: 10 }}>
            <Badge text="Connected to server" tone="green" small />
          </View>
        ) : null}
      </View>

      {/* Server target */}
      <Pressable
        onPress={() => setServerOpen(true)}
        style={{ alignSelf: 'center', marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}
      >
        <T size={F.xs} color={C.textFaint}>
          Server: {getApiBase()}
          {hasSavedApiBase() ? '' : ' (auto)'} · tap to change
        </T>
      </Pressable>

      {/* Mode tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: R.md, padding: 4, borderWidth: 1, borderColor: C.border }}>
        {modeTabs}
      </View>

      <ErrorBanner message={error} />
      <InfoBanner message={notice} />

      {/* ── Sign in ── */}
      {mode === 'signin' ? (
        <Card style={{ marginTop: 14 }}>
          <Input
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.in"
          />
          <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
          {totpStep ? (
            <Input
              label="Authenticator code or backup code"
              value={totpCode}
              onChangeText={setTotpCode}
              placeholder="123456 or ABCDE-FGHIJ"
              autoCapitalize="characters"
            />
          ) : null}
          <Btn title={busy ? 'Verifying…' : totpStep ? 'Verify code & sign in' : 'Sign in'} onPress={() => doSignIn(totpStep)} loading={busy} />
          <T size={F.xs} color={C.textFaint} align="center" style={{ marginTop: 10 }}>
            The raw password never leaves this device — a PBKDF2 verifier is derived locally, exactly like the web app.
          </T>
        </Card>
      ) : null}

      {/* ── Register ── */}
      {mode === 'register' ? (
        <Card style={{ marginTop: 14 }}>
          <Input label="Full name" value={name} onChangeText={setName} placeholder="Priya Sharma" />
          <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@company.in" />
          <Input label="Employee ID (optional)" value={employeeId} onChangeText={setEmployeeId} placeholder="EMP-042" />
          <T size={F.sm} color={C.textDim} weight="600" style={{ marginBottom: 8 }}>
            Role
          </T>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {(['seller', 'compliance_officer'] as UserRole[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: R.md,
                  borderWidth: 1.4,
                  borderColor: role === r ? C.primary : C.border,
                  backgroundColor: role === r ? 'rgba(59,130,246,0.12)' : 'transparent',
                  alignItems: 'center',
                }}
              >
                <T size={F.sm} color={role === r ? C.primaryBright : C.textDim} weight="600">
                  {r === 'seller' ? '🏪 Seller' : '🛡️ Officer'}
                </T>
              </Pressable>
            ))}
          </View>
          {role === 'compliance_officer' ? (
            <Input
              label="Officer invite code"
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="From OFFICER_INVITE_CODES"
              hint={auth.officerRegistration ? 'Required — ask the deployment admin.' : 'Officer registration is disabled on this deployment.'}
            />
          ) : null}
          <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="8+ chars, a letter and a number" />
          <Input label="Confirm password" secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Repeat password" />
          <Btn title={busy ? 'Creating account…' : 'Create account'} onPress={doRegister} loading={busy} />
        </Card>
      ) : null}

      {/* ── Forgot password ── */}
      {mode === 'forgot' ? (
        <Card style={{ marginTop: 14 }}>
          {!ticket ? (
            <>
              <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@company.in" />
              <Btn title={busy ? 'Starting…' : 'Start password reset'} onPress={doForgotStart} loading={busy} />
              <T size={F.xs} color={C.textFaint} style={{ marginTop: 10 }}>
                You must have configured security questions (Settings → Account Security) before losing the password.
              </T>
            </>
          ) : (
            <>
              {questions.map((q, i) => (
                <Input
                  key={q}
                  label={q}
                  value={answers[i]}
                  onChangeText={(v) => {
                    const next = [...answers];
                    next[i] = v;
                    setAnswers(next);
                  }}
                  placeholder="Your answer"
                />
              ))}
              <Input label="New password" secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="8+ chars, a letter and a number" />
              <Btn title={busy ? 'Resetting…' : 'Reset password & sign in'} onPress={doForgotReset} loading={busy} />
            </>
          )}
        </Card>
      ) : null}

      <T size={F.xs} color={C.textFaint} align="center" style={{ marginTop: 24 }}>
        SIH26034 · Dept. of Consumer Affairs · Government of India
      </T>

      <BusyOverlay visible={busy} label="Deriving secure verifier (PBKDF2, 150k iterations)…" />

      {/* Server URL sheet */}
      <Sheet visible={serverOpen} onClose={() => setServerOpen(false)} title="LMCC Server" scroll>
        <T size={F.sm} color={C.textDim} style={{ marginBottom: 14 }}>
          The mobile app talks to the same Next.js backend as the web app. Use your computer's LAN IP when testing on a real device (e.g. http://192.168.1.10:3000),
          or http://10.0.2.2:3000 inside the Android emulator.
        </T>
        <Input label="Server URL" autoCapitalize="none" keyboardType="url" value={serverUrl} onChangeText={setServerUrl} placeholder="http://192.168.1.10:3000" />
        {serverMsg ? (
          serverMsg.startsWith('Saved —') ? (
            <InfoBanner message={serverMsg} />
          ) : (
            <ErrorBanner message={serverMsg} />
          )
        ) : null}
        <Btn title="Save & test connection" onPress={doSaveServer} />
      </Sheet>
    </Screen>
  );
}
