// ═══════════════════════════════════════════════════════════════
// Lite Mode — memory/CPU-conscious operation for constrained devices.
//
// On devices with little RAM/CPU to spare, Lite Mode trims everything
// that is pure presentation cost (background animations, the custom
// cursor, smooth scrolling, hover transitions) and reduces the working
// resolution of OCR image processing. Full mode is unchanged.
//
// Preference is 'auto' by default: Lite Mode activates itself only on
// devices reporting constrained hardware (navigator.deviceMemory <= 2GB
// or <= 2 CPU cores) and never activates on capable devices.
// ═══════════════════════════════════════════════════════════════

export type LiteModePref = 'auto' | 'on' | 'off';

const LITE_MODE_KEY = 'lmcc-lite-mode';

export function getLiteModePref(): LiteModePref {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(LITE_MODE_KEY);
    return raw === 'on' || raw === 'off' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export function setLiteModePref(pref: LiteModePref): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LITE_MODE_KEY, pref);
  } catch {
    // Storage unavailable — preference applies for this session only
  }
  // Listeners (AppShell body class, CustomCursor) re-read isLiteMode() live.
  try {
    window.dispatchEvent(new CustomEvent('lmcc-lite-mode-changed'));
  } catch {
    // Extremely old browsers: class applies on next full reload
  }
}

/** Device signals, normalized (deviceMemory is Chrome-only; may be undefined). */
function deviceSignals(): { memoryGb: number | null; cores: number | null } {
  if (typeof navigator === 'undefined') return { memoryGb: null, cores: null };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
  };
}

/**
 * Heuristic recommendation shown in Settings BEFORE the user picks:
 * true when the device reports constrained hardware.
 */
export function getLiteModeRecommendation(): { recommend: boolean; reason: string } {
  const { memoryGb, cores } = deviceSignals();
  if (memoryGb !== null && memoryGb <= 2) {
    return { recommend: true, reason: `Your device reports ~${memoryGb}GB of RAM.` };
  }
  if (cores !== null && cores <= 2) {
    return { recommend: true, reason: `Your device reports ${cores} CPU core${cores === 1 ? '' : 's'}.` };
  }
  return { recommend: false, reason: 'Your device has enough memory and CPU — Lite Mode is optional.' };
}

/**
 * Whether the app should currently run in Lite Mode.
 * 'on'/'off' win over auto; auto defers to the hardware heuristic.
 */
export function isLiteMode(): boolean {
  const pref = getLiteModePref();
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  const { memoryGb, cores } = deviceSignals();
  if (memoryGb !== null && memoryGb <= 2) return true;
  if (cores !== null && cores <= 2) return true;
  return false;
}
