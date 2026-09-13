// ═══════════════════════════════════════════════════════════════
// Scan sync — keeps localStorage scans in step with the server so a
// user sees the same data from any device.
//
// Model: server is the shared store; the local cache is a merge view.
//  - On sign-in: hydrate (union by id; local copy wins conflicts —
//    the device in hand is the freshest editor).
//  - On every data change (notifyDataChange): debounced push of the
//    merged snapshot.
//  - Internal mutations (seedDemoData, migrations) replay the push so
//    the server converges without per-callsite changes.
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let hydration = false;

export function isSyncing(): boolean {
  return hydration;
}

async function post(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false; // offline — local cache remains source of truth until push succeeds
  }
}

/** Merge server scans into localStorage (server fills gaps; local wins conflicts). */
async function hydrateFromServer(): Promise<void> {
  hydration = true;
  try {
    const res = await fetch('/api/scans', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { authenticated: boolean; scans?: unknown };
    if (!data.authenticated || !Array.isArray(data.scans)) return;

    // Dynamic import avoids a static cycle with local-data ↔ hooks.
    const localData = await import('./local-data');
    const merged = localData.mergeScansFromServer(data.scans);
    if (merged > 0) {
      const { notifyDataChange } = await import('./hooks');
      notifyDataChange();
    }
  } catch {
    // Offline or not-yet-persistent backend — local data stays as-is
  } finally {
    hydration = false;
  }
}

/** Debounced push of the full merged snapshot (small JSON; scans are text). */
export function scheduleScanSync(delayMs = 1200): void {
  if (typeof window === 'undefined') return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    try {
      const localData = await import('./local-data');
      await post({ mode: 'push', scans: localData.exportScansForSync() });
    } catch {
      // Swallow — retry on next change
    }
  }, delayMs);
}

/** Call once after sign-in / app mount when a session exists. */
export function startScanSync(): void {
  void hydrateFromServer();
}

/** Call on sign-out: stop timers; local cache is cleared by the caller. */
export function stopScanSync(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}
