// ═══════════════════════════════════════════════════════════════
// AI Providers — bring-your-own-key configuration, mirroring the
// web app's screen. Keys live only on this device and travel only
// through our SSRF-guarded server relays (/api/validate-api-key,
// /api/vision-fallback) — never to anyone else's server.
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import {
  AIProvider,
  PROVIDER_PRESETS,
  loadProviders,
  saveProviders,
} from '@/lib/ai-providers';
import { apiJson } from '@/lib/api';
import { generateId } from '@/lib/types';
import { C, F, R } from '@/theme';
import {
  Badge,
  Btn,
  Card,
  Empty,
  ErrorBanner,
  InfoBanner,
  Input,
  ListRow,
  Screen,
  SectionTitle,
  Sheet,
  SuccessBanner,
  T,
} from '@/components/ui';

const EMPTY_FORM = {
  id: '',
  name: '',
  apiUrl: '',
  model: '',
  apiKey: '',
  category: 'openrouter',
};

export default function AIProvidersScreen() {
  const [providers, setProviders] = useState<AIProvider[]>(loadProviders);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);

  function persist(list: AIProvider[]) {
    saveProviders(list);
    setProviders(list);
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setTestMsg(null);
    setTestErr(null);
    setFormOpen(true);
  }

  function openEdit(p: AIProvider) {
    setForm({ ...p });
    setTestMsg(null);
    setTestErr(null);
    setFormOpen(true);
  }

  function applyPreset(presetIndex: number) {
    const preset = PROVIDER_PRESETS[presetIndex];
    setForm((f) => ({
      ...f,
      name: preset.label,
      apiUrl: preset.apiUrl,
      model: preset.model,
      category: preset.category,
    }));
  }

  async function testConnection() {
    setTestErr(null);
    setTestMsg(null);
    if (!form.apiUrl.trim() || !form.model.trim() || !form.apiKey.trim()) {
      setTestErr('Fill the API URL, model, and key first.');
      return;
    }
    setTesting(true);
    const { ok, data } = await apiJson<{ valid?: boolean; error?: string; message?: string }>('/api/validate-api-key', {
      method: 'POST',
      body: JSON.stringify({
        apiKey: form.apiKey.trim(),
        apiUrl: form.apiUrl.trim(),
        model: form.model.trim(),
        category: form.category,
      }),
    });
    setTesting(false);
    if (ok && data.valid) setTestMsg(data.message ?? 'Connection works — this provider can serve scans.');
    else setTestErr(data.error ?? 'Test failed — check the key, URL, and model.');
  }

  function saveProvider() {
    if (!form.name.trim() || !form.apiUrl.trim() || !form.model.trim() || !form.apiKey.trim()) {
      setTestErr('All fields are required.');
      return;
    }
    const list = [...providers];
    const record: AIProvider = {
      id: form.id || generateId(),
      name: form.name.trim(),
      apiUrl: form.apiUrl.trim(),
      model: form.model.trim(),
      apiKey: form.apiKey.trim(),
      category: form.category,
      enabled: form.id ? providers.find((p) => p.id === form.id)?.enabled ?? false : providers.length === 0,
    };
    const idx = list.findIndex((p) => p.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    persist(list);
    setFormOpen(false);
  }

  function toggleEnabled(id: string) {
    persist(providers.map((p) => ({ ...p, enabled: p.id === id ? !p.enabled : false })));
  }

  function removeProvider(id: string) {
    const p = providers.find((x) => x.id === id);
    Alert.alert('Remove provider?', `${p?.name ?? 'This provider'} will be deleted from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => persist(providers.filter((x) => x.id !== id)) },
    ]);
  }

  return (
    <Screen>
      <SectionTitle>VISION PROVIDERS</SectionTitle>
      <InfoBanner message="Keys are stored ONLY on this device (same 'lmcc-ai-providers' store as the web app) and are only ever sent to our SSRF-guarded server relay. With no personal provider enabled, scans use the built-in default model — nothing to configure." />

      {providers.length === 0 ? (
        <Empty title="No personal providers" subtitle="Add your own OpenRouter or NVIDIA key, or keep using the built-in default model." />
      ) : (
        <View style={{ gap: 10 }}>
          {providers.map((p) => (
            <ListRow key={p.id} onPress={() => openEdit(p)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <T size={F.md} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {p.name}
                    </T>
                    {p.enabled ? <Badge text="ACTIVE" tone="green" small /> : null}
                  </View>
                  <T size={F.sm} color={C.textDim} numberOfLines={1}>
                    {p.model}
                  </T>
                  <T size={F.xs} color={C.textFaint} numberOfLines={1}>
                    {p.category} · key ••••{p.apiKey.slice(-4)}
                  </T>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => toggleEnabled(p.id)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: R.pill,
                      borderWidth: 1.4,
                      borderColor: p.enabled ? C.green : C.border,
                      backgroundColor: p.enabled ? 'rgba(16,185,129,0.14)' : 'transparent',
                    }}
                  >
                    <T size={F.xs} color={p.enabled ? '#34D399' : C.textDim} weight="600">
                      {p.enabled ? 'Enabled' : 'Enable'}
                    </T>
                  </Pressable>
                  <Pressable onPress={() => removeProvider(p.id)} hitSlop={8} style={{ justifyContent: 'center' }}>
                    <T size={F.md} color="#F87171">
                      🗑
                    </T>
                  </Pressable>
                </View>
              </View>
            </ListRow>
          ))}
        </View>
      )}

      <View style={{ marginTop: 14 }}>
        <Btn title="+ Add provider" variant="outline" onPress={openAdd} small />
      </View>
      <T size={F.xs} color={C.textFaint} style={{ marginTop: 10 }}>
        Free keys: openrouter.ai and build.nvidia.com both offer free vision tiers. The catalogue linked from the web app lists more.
      </T>

      <Sheet visible={formOpen} onClose={() => setFormOpen(false)} title={form.id ? 'Edit provider' : 'Add provider'} scroll>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {PROVIDER_PRESETS.map((preset, i) => (
            <Pressable
              key={preset.label}
              onPress={() => applyPreset(i)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: R.md,
                borderWidth: 1.4,
                borderColor: form.apiUrl === preset.apiUrl ? C.primary : C.border,
                backgroundColor: form.apiUrl === preset.apiUrl ? 'rgba(59,130,246,0.12)' : 'transparent',
                alignItems: 'center',
              }}
            >
              <T size={F.sm} color={form.apiUrl === preset.apiUrl ? C.primaryBright : C.textDim} weight="600">
                {preset.label}
              </T>
            </Pressable>
          ))}
        </View>
        <Input label="Display name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="My OpenRouter key" />
        <Input label="API URL (OpenAI-compatible chat/completions)" autoCapitalize="none" keyboardType="url" value={form.apiUrl} onChangeText={(v) => setForm({ ...form, apiUrl: v })} placeholder="https://openrouter.ai/api/v1/chat/completions" />
        <Input label="Model ID" autoCapitalize="none" value={form.model} onChangeText={(v) => setForm({ ...form, model: v })} placeholder="meta/llama-3.2-11b-vision-instruct" />
        <Input label="API key" autoCapitalize="none" secureTextEntry value={form.apiKey} onChangeText={(v) => setForm({ ...form, apiKey: v })} placeholder="sk-or-v1-…" />
        <Input label="Category (openrouter / nvidia / custom)" autoCapitalize="none" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="openrouter" />
        {testErr ? <ErrorBanner message={testErr} /> : null}
        {testMsg ? <SuccessBanner message={testMsg} /> : null}
        <Btn title={testing ? 'Testing…' : 'Test connection'} variant="outline" onPress={testConnection} loading={testing} small />
        <View style={{ height: 10 }} />
        <Btn title={busy ? 'Saving…' : 'Save provider'} onPress={saveProvider} loading={busy} />
      </Sheet>
    </Screen>
  );
}
