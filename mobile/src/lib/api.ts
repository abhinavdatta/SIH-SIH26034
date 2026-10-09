// ═══════════════════════════════════════════════════════════════
// API — fetch layer for the LMCC Next.js backend.
//
// The mobile app is a native client of the SAME backend the web app
// uses (/api/auth, /api/scans, /api/vision-fallback, …). Sessions ride
// the same httpOnly cookie: React Native's native networking layer
// stores cookies in the OS cookie jar (NSHTTPCookieStorage on iOS,
// CookieManager on Android), so they survive app restarts — we just
// send `credentials: 'include'` on every call.
//
// The server URL is configurable (Settings → Server) because a phone
// cannot reach a dev machine via "localhost". Defaults, in order:
//   1. the URL the user saved,
//   2. the LAN host of the Expo dev server (works in Expo Go / dev
//      client when the backend runs on the same machine on :3000),
//   3. http://localhost:3000 (Android emulator → 10.0.2.2 manually).
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_BASE_KEY = 'lmcc_api_base';

let savedBase: string | null = null;
let initialized = false;

/** LAN host of the Expo dev server, when reachable (real devices on Wi-Fi). */
function devServerBase(): string | null {
  const hostUri = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return `http://${host}:3000`;
}

export function getApiBase(): string {
  if (savedBase) return savedBase;
  return devServerBase() ?? 'http://localhost:3000';
}

/** True when the base comes from the saved override (vs auto-detection). */
export function hasSavedApiBase(): boolean {
  return savedBase !== null;
}

/** Called once from the root layout boot sequence. */
export async function initApiBase(): Promise<void> {
  try {
    savedBase = await AsyncStorage.getItem(API_BASE_KEY);
  } catch {
    savedBase = null;
  }
  initialized = true;
}

export function isApiBaseInitialized(): boolean {
  return initialized;
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) return null;
  return trimmed;
}

/** Persist a server URL override. Returns false for malformed input. */
export async function setApiBase(url: string): Promise<boolean> {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  savedBase = normalized;
  await AsyncStorage.setItem(API_BASE_KEY, normalized);
  return true;
}

/** Drop the override and go back to auto-detection. */
export async function clearApiBase(): Promise<void> {
  savedBase = null;
  await AsyncStorage.removeItem(API_BASE_KEY);
}

/** fetch() against the configured backend; cookies always included. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(getApiBase() + path, {
    ...init,
    headers,
    credentials: 'include',
  });
}

/** fetch + safe JSON parse in one step. Never throws; ok=false on network errors. */
export async function apiJson<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await apiFetch(path, init);
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      data = {} as T;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export function unreachableError(): string {
  return 'Could not reach the LMCC server — check the Server URL in Settings and that the backend is running.';
}
