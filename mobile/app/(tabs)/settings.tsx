// ═══════════════════════════════════════════════════════════════
// Settings — account, server connection, AI providers, about.
// Sign-out wipes this device's cached scans (the account copy stays
// server-side and re-hydrates on the next sign-in).
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { getApiBase, setApiBase, hasSavedApiBase, apiJson } from '@/lib/api';
import { enabledProvider, loadProviders } from '@/lib/ai-providers';
import { C, F } from '@/theme';
import {
  Badge,
  Btn,
  Card,
  ErrorBanner,
  InfoBanner,
  Input,
  Screen,
  SectionTitle,
  T,
} from '@/components/ui';

export default function SettingsScreen() {
  const auth = useAuth();
  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setServerUrl(getApiBase());
  }, []);

  async function saveServer() {
    setServerMsg(null);
    setServerErr(null);
    setTesting(true);
    const ok = await setApiBase(serverUrl.trim());
    if (!ok) {
      setTesting(false);
      setServerErr('Enter a full URL like http://192.168.1.10:3000');
      return;
    }
    const { ok: reachable } = await apiJson('/api/auth');
    setTesting(false);
    if (reachable) setServerMsg('Saved — server reachable.');
    else setServerErr('Saved, but the server did not respond. Check the URL and that the backend is running.');
  }

  const providers = loadProviders();
  const active = enabledProvider();

  async function doSignOut() {
    setSigningOut(true);
    await auth.signOut();
    setSigningOut(false);
    router.replace('/login');
  }

  return (
    <Screen>
      <T size={F.xxl} weight="700" style={{ marginBottom: 4 }}>
        ⚙️ Settings
      </T>
      <T size={F.sm} color={C.textDim} style={{ marginBottom: 16 }}>
        {auth.persistent ? 'Cross-device sync is active — accounts and scans live server-side.' : 'Connected to the LMCC server.'}
      </T>

      {/* Account */}
      <SectionTitle>ACCOUNT</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <T size={F.lg} weight="700">
              {auth.user?.name ?? '—'}
            </T>
            <T size={F.sm} color={C.textDim}>
              {auth.user?.email}
            </T>
            {auth.user?.employeeId ? (
              <T size={F.sm} color={C.textFaint}>
                {auth.user.employeeId}
              </T>
            ) : null}
          </View>
          <Badge text={auth.user?.role === 'compliance_officer' ? '🛡️ Officer' : '🏪 Seller'} tone={auth.user?.role === 'compliance_officer' ? 'violet' : 'blue'} />
        </View>
        <View style={{ marginTop: 14, gap: 8 }}>
          <Btn title="Account Security · password · 2FA · questions" variant="outline" small onPress={() => router.push('/settings/security')} />
          <Btn title="AI Providers · bring your own key" variant="outline" small onPress={() => router.push('/settings/providers')} />
        </View>
      </Card>

      {/* Server */}
      <SectionTitle>LMCC SERVER</SectionTitle>
      <Card>
        <Input
          label={`Server URL${hasSavedApiBase() ? '' : ' (auto-detected — edit to pin)'}`}
          autoCapitalize="none"
          keyboardType="url"
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.10:3000"
          hint="Same Next.js backend the web app runs. Use your computer's LAN IP for a real device on Wi-Fi, or http://10.0.2.2:3000 in the Android emulator."
        />
        {serverMsg ? <InfoBanner message={serverMsg} /> : null}
        {serverErr ? <ErrorBanner message={serverErr} /> : null}
        <Btn title={testing ? 'Testing…' : 'Save & test connection'} onPress={saveServer} loading={testing} small />
      </Card>

      {/* AI summary */}
      <SectionTitle>AI STATUS</SectionTitle>
      <Card>
        <T size={F.md} weight="600">
          {active ? active.name : 'Built-in default model'}
        </T>
        <T size={F.sm} color={C.textDim} style={{ marginTop: 2 }}>
          {active ? `${active.model} · your key, stored on this device` : 'meta/llama-3.2-11b-vision-instruct · server-held key · 10 scans/min per network'}
        </T>
        {providers.length > 0 ? (
          <T size={F.xs} color={C.textFaint} style={{ marginTop: 6 }}>
            {providers.length} provider{providers.length === 1 ? '' : 's'} configured
          </T>
        ) : null}
      </Card>

      {/* Sign out */}
      <SectionTitle>SESSION</SectionTitle>
      <Btn title={signingOut ? 'Signing out…' : 'Sign out'} variant="danger" onPress={doSignOut} loading={signingOut} />
      <T size={F.xs} color={C.textFaint} style={{ marginTop: 8 }}>
        Clears this device's cached scans. Your account and scans stay safe server-side and re-hydrate on the next sign-in — here or on the web.
      </T>

      {/* About */}
      <SectionTitle>ABOUT</SectionTitle>
      <Card>
        <T size={F.md} weight="700">
          ⚖️ LMCC — Legal Metrology Compliance Checker
        </T>
        <T size={F.sm} color={C.textDim} style={{ marginTop: 4 }}>
          Native mobile port · v{Constants.expoConfig?.version ?? '1.0.0'}
        </T>
        <T size={F.sm} color={C.textFaint} style={{ marginTop: 8 }}>
          SIH26034 · Dept. of Consumer Affairs, Government of India. Hackathon project — not legal advice; verify compliance determinations against the official Rules text.
        </T>
        <T size={F.xs} color={C.textFaint} style={{ marginTop: 6 }}>
          github.com/abhinavdatta
        </T>
      </Card>
    </Screen>
  );
}
