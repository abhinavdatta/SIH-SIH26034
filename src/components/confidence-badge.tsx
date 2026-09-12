/* ═══════════════════════════════════════════════════════════════
   ConfidenceBadge — visual trust signal for OCR confidence
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { getConfidenceLevel } from '@/lib/extract/types';

interface ConfidenceBadgeProps {
  score: number | undefined;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

const STYLES: Record<string, { label: string; dot: string }> = {
  high: { label: 'High', dot: '#10B981' },
  medium: { label: 'Med', dot: '#F59E0B' },
  low: { label: 'Low', dot: '#EF4444' },
};

export function ConfidenceBadge({ score, showScore = false, size = 'sm' }: ConfidenceBadgeProps) {
  const validScore = score ?? 0;
  const level = getConfidenceLevel(validScore);
  const style = STYLES[level];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-medium tabular-nums"
      style={{
        fontSize: size === 'sm' ? '11px' : '12px',
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        color: 'var(--text-secondary)',
      }}
      title={`Confidence: ${Math.round(validScore * 100)}%`}
    >
      <span
        className="shrink-0 rounded-full"
        style={{
          width: size === 'sm' ? 6 : 8,
          height: size === 'sm' ? 6 : 8,
          background: style.dot,
        }}
      />
      {style.label}
      {showScore && (
        <span style={{ opacity: 0.6 }}>{Math.round(validScore * 100)}%</span>
      )}
    </span>
  );
}
