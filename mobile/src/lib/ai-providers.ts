// ═══════════════════════════════════════════════════════════════
// AI Providers — bring-your-own-key vision providers, stored on the
// device under the SAME localStorage key and shape the web app uses
// ('lmcc-ai-providers'). Keys never leave the device except through
// our SSRF-guarded /api/validate-api-key and /api/vision-fallback
// relays.
// ═══════════════════════════════════════════════════════════════

import { localStore } from './storage';

const PROVIDERS_KEY = 'lmcc-ai-providers';

export interface AIProvider {
  id: string;
  name: string;
  apiUrl: string;
  model: string;
  apiKey: string;
  category: string; // 'openrouter' | 'nvidia' | custom label
  enabled?: boolean;
}

export const PROVIDER_PRESETS: Array<{ label: string; apiUrl: string; model: string; category: string }> = [
  { label: 'OpenRouter', apiUrl: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.2-11b-vision-instruct', category: 'openrouter' },
  { label: 'NVIDIA NIM', apiUrl: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta/llama-3.2-11b-vision-instruct', category: 'nvidia' },
];

export function loadProviders(): AIProvider[] {
  try {
    const raw = localStore.getItem(PROVIDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AIProvider[]) : [];
  } catch {
    return [];
  }
}

export function saveProviders(list: AIProvider[]): void {
  localStore.setItem(PROVIDERS_KEY, JSON.stringify(list));
}

/** The single enabled provider used for AI scans, or null for the built-in default. */
export function enabledProvider(): AIProvider | null {
  return loadProviders().find((p) => p.enabled) ?? null;
}
