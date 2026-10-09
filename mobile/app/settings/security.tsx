// ═══════════════════════════════════════════════════════════════
// Account Security — change password, authenticator 2FA (QR is
// generated server-side and shown as a PNG), single-use backup
// codes, and the three security questions that power forgot-
// password resets. Same endpoints and guarantees as the web app.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth, validatePassword } from '@/lib/auth';
import { apiJson } from '@/lib/api';
import { C, F, R } from '@/theme';
import {
  Badge,
  Btn,
  Card,
  ErrorBanner,
  InfoBanner,
  Input,
  Screen,
  SectionTitle,
  SuccessBanner,
  T,
} from '@/components/ui';

export default function AccountSecurityScreen() {
  const auth = useAuth();

  /* ── Change password ── */
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function changePassword() {
    setPwErr(null);
    setPwMsg(null);
    const check = validatePassword(newPw);
    if (check) return setPwErr(check);
    if (newPw !== confirmPw) return setPwErr('New passwords do not match');
    if (currentPw === newPw) return setPwErr('New password must be different from the current one');
    setPwBusy(true);
    const res = await auth.changePassword(currentPw, newPw);
    setPwBusy(false);
    if (res.ok) {
      setPwMsg('Password changed. Other devices were signed out; this device keeps its session.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } else {
      setPwErr(res.error ?? 'Could not change the password');
    }
  }

  /* ── 2FA ── */
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [totpErr, setTotpErr] = useState<string | null>(null);
  const [totpMsg, setTotpMsg] = useState<string | null>(null);
  const [disablePw, setDisablePw] = useState('');

  async function beginSetup() {
    setTotpErr(null);
    setTotpMsg(null);
    setTotpBusy(true);
    const res = await auth.beginTotpSetup();
    setTotpBusy(false);
    if (res.ok && res.secret && res.otpauthUrl) {
      setTotpSecret(res.secret);
      setTotpQr(res.qrDataUrl ?? null);
    } else {
      setTotpErr(res.error ?? 'Could not start 2FA setup');
    }
  }

  async function confirmSetup() {
    setTotpErr(null);
    if (!totpCode.trim()) return setTotpErr('Enter the 6-digit code your app shows');
    setTotpBusy(true);
    const res = await auth.confirmTotp(totpCode.trim());
    setTotpBusy(false);
    if (res.ok && res.backupCodes) {
      setBackupCodes(res.backupCodes);
      setTotpSecret(null);
      setTotpQr(null);
      setTotpCode('');
      setTotpMsg('Two-factor authentication is now on.');
    } else {
      setTotpErr(res.error ?? 'That code did not match');
    }
  }

  async function disableTotp() {
    setTotpErr(null);
    setTotpBusy(true);
    const res = await auth.disableTotp(disablePw);
    setTotpBusy(false);
    if (res.ok) {
      setDisablePw('');
      setTotpMsg('Two-factor authentication is off.');
      await auth.refresh();
    } else {
      setTotpErr(res.error ?? 'Password confirmation failed');
    }
  }

  /* ── Security questions ── */
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [qBusy, setQBusy] = useState(false);
  const [qMsg, setQMsg] = useState<string | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await apiJson<{ questions?: string[] }>('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ mode: 'security-setup' }),
      });
      if (data.questions && data.questions.length === 3) setQuestions(data.questions);
    })();
  }, []);

  async function saveQuestions() {
    setQErr(null);
    setQMsg(null);
    if (answers.some((a) => a.trim().length < 2)) return setQErr('Answer all three questions (2+ characters each)');
    setQBusy(true);
    const res = await auth.saveSecurityAnswers(answers.map((a) => a.trim()));
    setQBusy(false);
    if (res.ok) {
      setQMsg('Security questions saved — you can now reset your password from the login screen.');
      setAnswers(['', '', '']);
    } else {
      setQErr(res.error ?? 'Could not save');
    }
  }

  return (
    <Screen>
      {/* Change password */}
      <SectionTitle>CHANGE PASSWORD</SectionTitle>
      <Card>
        <Input label="Current password" secureTextEntry value={currentPw} onChangeText={setCurrentPw} placeholder="••••••••" />
        <Input label="New password" secureTextEntry value={newPw} onChangeText={setNewPw} placeholder="8+ chars, a letter and a number" />
        <Input label="Confirm new password" secureTextEntry value={confirmPw} onChangeText={setConfirmPw} placeholder="Repeat new password" />
        {pwErr ? <ErrorBanner message={pwErr} /> : null}
        {pwMsg ? <SuccessBanner message={pwMsg} /> : null}
        <Btn title={pwBusy ? 'Changing…' : 'Change password'} onPress={changePassword} loading={pwBusy} small />
      </Card>

      {/* 2FA */}
      <SectionTitle>AUTHENTICATOR 2FA</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={F.md} weight="600">
            Two-factor authentication
          </T>
          <Badge text={auth.totpEnabled ? 'ON' : 'OFF'} tone={auth.totpEnabled ? 'green' : 'slate'} small />
        </View>

        {auth.totpEnabled ? (
          <View style={{ marginTop: 12 }}>
            <T size={F.sm} color={C.textDim}>
              Your account requires a 6-digit authenticator code (or one of your remaining backup codes) at sign-in.
            </T>
            <View style={{ marginTop: 10 }}>
              <Input label="Current password (to turn 2FA off)" secureTextEntry value={disablePw} onChangeText={setDisablePw} placeholder="••••••••" />
            </View>
            <Btn title={totpBusy ? 'Working…' : 'Turn 2FA off'} variant="danger" onPress={disableTotp} loading={totpBusy} small />
          </View>
        ) : totpSecret ? (
          <View style={{ marginTop: 12 }}>
            <T size={F.sm} color={C.textDim}>
              Scan this QR with Google Authenticator, Authy, or any TOTP app — or type the secret manually.
            </T>
            {totpQr ? (
              <View style={{ alignItems: 'center', marginVertical: 14 }}>
                <Image source={{ uri: totpQr }} style={{ width: 200, height: 200, borderRadius: R.md, backgroundColor: '#FFFFFF', padding: 8 }} />
              </View>
            ) : null}
            <View style={{ backgroundColor: C.bgSoft, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 10 }}>
              <T size={F.xs} color={C.textFaint}>
                Secret (base32)
              </T>
              <T size={F.sm} weight="600" style={{ marginTop: 2, letterSpacing: 1 }}>
                {totpSecret}
              </T>
            </View>
            <Input
              label="6-digit code from your app"
              value={totpCode}
              onChangeText={setTotpCode}
              placeholder="123456"
              keyboardType="number-pad"
            />
            <Btn title={totpBusy ? 'Verifying…' : 'Verify & enable 2FA'} onPress={confirmSetup} loading={totpBusy} small />
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <T size={F.sm} color={C.textDim}>
              Add a second factor: a time-based code from an authenticator app. Ten single-use backup codes are issued when you enable it.
            </T>
            <View style={{ marginTop: 10 }}>
              <Btn title="Set up authenticator" onPress={beginSetup} loading={totpBusy} small />
            </View>
          </View>
        )}

        {totpErr ? <ErrorBanner message={totpErr} /> : null}
        {totpMsg ? <SuccessBanner message={totpMsg} /> : null}

        {backupCodes ? (
          <View style={{ marginTop: 14 }}>
            <InfoBanner message="Save these backup codes now — they are shown only once. Each works a single time if you lose your authenticator." />
            <Card style={{ backgroundColor: C.bgSoft }}>
              {backupCodes.map((code) => (
                <T key={code} size={F.md} weight="700" style={{ letterSpacing: 1, marginBottom: 6 }}>
                  {code}
                </T>
              ))}
            </Card>
            <Btn
              title="Copy all backup codes"
              variant="outline"
              small
              onPress={() => Clipboard.setStringAsync(backupCodes.join('\n'))}
            />
          </View>
        ) : null}
      </Card>

      {/* Security questions */}
      <SectionTitle>SECURITY QUESTIONS {auth.hasSecurityAnswers ? '· CONFIGURED' : ''}</SectionTitle>
      <Card>
        <T size={F.sm} color={C.textDim}>
          These answers let you reset your password from the login screen when locked out (answers are stored hashed + encrypted, never in plain text).
        </T>
        <View style={{ height: 12 }} />
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
        {qErr ? <ErrorBanner message={qErr} /> : null}
        {qMsg ? <SuccessBanner message={qMsg} /> : null}
        <Btn title={qBusy ? 'Saving…' : auth.hasSecurityAnswers ? 'Replace answers' : 'Save answers'} onPress={saveQuestions} loading={qBusy} small />
      </Card>
    </Screen>
  );
}
