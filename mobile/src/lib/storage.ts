// ═══════════════════════════════════════════════════════════════
// Storage — synchronous localStorage-compatible shim for React
// Native, backed by AsyncStorage.
//
// The web app's data layer (local-data.ts) is written against the
// synchronous localStorage API. AsyncStorage is async-only, so this
// shim keeps an in-memory Map as the live store and persists a single
// JSON blob (debounced) to AsyncStorage. `hydrate()` must be awaited
// once at boot, before the first render that touches local-data.
//
// Ported from the LMCC web app. Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import AsyncStorage from '@react-native-async-storage/async-storage';

const BLOB_KEY = 'lmcc_localstore_blob';
const FLUSH_DELAY_MS = 400;

const cache = new Map<string, string>();
let hydrated = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Await once at app boot (root layout) before rendering app content. */
export function hydrateStore(): Promise<void> {
  return AsyncStorage.getItem(BLOB_KEY)
    .then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, string>;
          for (const key of Object.keys(parsed)) cache.set(key, parsed[key]);
        } catch {
          // Corrupt blob — start clean rather than crash.
        }
      }
      hydrated = true;
    })
    .catch(() => {
      hydrated = true;
    });
}

export function isStoreHydrated(): boolean {
  return hydrated;
}

function flush(): void {
  flushTimer = null;
  try {
    AsyncStorage.setItem(BLOB_KEY, JSON.stringify(Object.fromEntries(cache))).catch(() => {
      // Persistence is best-effort; the in-memory view stays authoritative
      // for this session either way.
    });
  } catch {
    // Synchronous JSON failures are ignored for the same reason.
  }
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

/** localStorage-shaped facade used by the ported local-data module. */
export const localStore = {
  getItem(key: string): string | null {
    return cache.has(key) ? (cache.get(key) as string) : null;
  },
  setItem(key: string, value: string): void {
    cache.set(key, String(value));
    scheduleFlush();
  },
  removeItem(key: string): void {
    cache.delete(key);
    scheduleFlush();
  },
  /** Test/debug helper — not part of the localStorage shape. */
  clearAll(): void {
    cache.clear();
    scheduleFlush();
  },
};
