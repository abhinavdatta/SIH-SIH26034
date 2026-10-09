// ═══════════════════════════════════════════════════════════════
// Theme — design tokens for the LMCC mobile app.
// Mirrors the web app's dark palette (slate + blue accent).
// ═══════════════════════════════════════════════════════════════

export const C = {
  bg: '#020617',
  bgSoft: '#0B1220',
  card: '#0F172A',
  cardSoft: '#16213B',
  border: '#1E293B',
  borderSoft: '#253349',
  text: '#F1F5F9',
  textDim: '#94A3B8',
  textFaint: '#64748B',
  primary: '#3B82F6',
  primaryBright: '#60A5FA',
  primaryDeep: '#1D4ED8',
  onPrimary: '#FFFFFF',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#3B82F6',
  violet: '#8B5CF6',
  slate: '#64748B',
};

export const R = { sm: 6, md: 10, lg: 16, xl: 22, pill: 999 };

export const F = {
  xs: 11,
  sm: 12.5,
  md: 14.5,
  lg: 16.5,
  xl: 20,
  xxl: 26,
};

/* ── Status tone system ── */

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'violet';

export const toneColors: Record<Tone, { fg: string; bg: string; border: string; solid: string }> = {
  green: { fg: '#34D399', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.45)', solid: '#10B981' },
  amber: { fg: '#FBBF24', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.45)', solid: '#F59E0B' },
  red: { fg: '#F87171', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.45)', solid: '#EF4444' },
  blue: { fg: '#60A5FA', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.45)', solid: '#3B82F6' },
  slate: { fg: '#94A3B8', bg: 'rgba(100,116,139,0.16)', border: 'rgba(100,116,139,0.4)', solid: '#64748B' },
  violet: { fg: '#A78BFA', bg: 'rgba(139,92,246,0.14)', border: 'rgba(139,92,246,0.45)', solid: '#8B5CF6' },
};

export const SCAN_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  extracted: { label: 'Extracted', tone: 'slate' },
  needs_review: { label: 'Needs Review', tone: 'amber' },
  compliant: { label: 'Compliant', tone: 'green' },
  non_compliant: { label: 'Non-Compliant', tone: 'red' },
  completed: { label: 'Completed', tone: 'blue' },
};

export const FIELD_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  compliant: { label: 'Compliant', tone: 'green' },
  non_compliant: { label: 'Non-Compliant', tone: 'red' },
  missing: { label: 'Missing', tone: 'slate' },
  needs_review: { label: 'Needs Review', tone: 'amber' },
  not_applicable: { label: 'N/A', tone: 'slate' },
};

export const REVIEW_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending Review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  overridden: { label: 'Overridden', tone: 'violet' },
};

export const SEVERITY_META: Record<string, { label: string; tone: Tone }> = {
  HIGH: { label: 'HIGH', tone: 'red' },
  MEDIUM: { label: 'MEDIUM', tone: 'amber' },
  LOW: { label: 'LOW', tone: 'slate' },
};

/* ── Formatters ── */

export function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fileStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
