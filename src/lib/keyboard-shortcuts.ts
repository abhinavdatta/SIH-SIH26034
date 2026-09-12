// ═══════════════════════════════════════════════════════════════
// Accessibility hooks — global keyboard shortcuts for the SPA.
//
// - Alt+1..8: switch views (Dashboard, Scan, Review, History, Legal,
//   AI Providers, Settings)
// - Alt+K: toggle the keyboard-shortcut cheat sheet
//
// Bindings live in one module so AppShell owns a single global
// keydown listener; components never add their own global handlers.
// ═══════════════════════════════════════════════════════════════

import type { ViewName } from './types';

export interface ShortcutSpec {
  keys: string;
  description: string;
  view: ViewName | 'cheatsheet';
}

export const VIEW_SHORTCUTS: ShortcutSpec[] = [
  { keys: 'Alt+1', description: 'Dashboard', view: 'dashboard' },
  { keys: 'Alt+2', description: 'Scan Product', view: 'upload-scan' },
  { keys: 'Alt+3', description: 'Review Queue', view: 'review-queue' },
  { keys: 'Alt+4', description: 'Scan History', view: 'product-history' },
  { keys: 'Alt+5', description: 'Legal Reference', view: 'legal-reference' },
  { keys: 'Alt+6', description: 'AI Providers', view: 'ai-providers' },
  { keys: 'Alt+7', description: 'Settings', view: 'settings' },
  { keys: 'Alt+K', description: 'Show / hide keyboard shortcuts', view: 'cheatsheet' },
];

/** Map an event to the shortcut it matches, or null. */
export function matchShortcut(e: KeyboardEvent): ShortcutSpec | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'k') return VIEW_SHORTCUTS[VIEW_SHORTCUTS.length - 1];
  const index = Number.parseInt(key, 10);
  if (Number.isInteger(index) && index >= 1 && index <= 7) return VIEW_SHORTCUTS[index - 1];
  return null;
}
