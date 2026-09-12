/* ═══════════════════════════════════════════════════════════════════════════
   Review Queue — pending fields that need human review
   All data sourced from localStorage; no API calls.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import { ClipboardCheck, CheckCircle2, Save, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useReviewQueue, notifyDataChange } from '@/lib/hooks';
import { updateFieldReview } from '@/lib/local-data';
import { FIELD_KEY_TO_LABEL, FIELD_STATUS_COLORS, SEVERITY_COLORS } from '@/lib/types';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { useAppStore } from '@/lib/store';
import { captureTrainingPair, isTrainingCaptureEnabled } from '@/lib/training-samples';

export default function ReviewQueueView() {
  const queue = useReviewQueue();
  const { triggerRefresh } = useAppStore();
  const [overrideValues, setOverrideValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');

  const filtered = filter === 'all' ? queue : queue.filter(item => item.severity === filter);

  function handleApprove(scanId: string, fieldId: string) {
    updateFieldReview(scanId, fieldId, { reviewStatus: 'approved' });
    triggerRefresh();
    notifyDataChange();
    toast.success('Field approved');
  }

  function handleOverride(scanId: string, fieldId: string) {
    const val = overrideValues[`${scanId}-${fieldId}`];
    if (!val?.trim()) {
      toast.error('Please enter a corrected value');
      return;
    }
    const item = queue.find(q => q.scanId === scanId && q.scanFieldId === fieldId);
    updateFieldReview(scanId, fieldId, { value: val, reviewStatus: 'overridden' });

    // Opt-in training capture: this override IS a human-verified correction
    // of a low-confidence field — exactly a labeled OCR training pair. Only
    // fires on actual overrides (never plain Approve), and only when the
    // user enabled training capture in Settings. Fire-and-forget.
    if (isTrainingCaptureEnabled() && item) {
      void captureTrainingPair({
        scanId,
        fieldName: item.fieldName,
        correctedValue: val.trim(),
        originalValue: item.originalValue,
        scanProductName: item.scanProductName,
      });
    }

    setOverrideValues(prev => {
      const next = { ...prev };
      delete next[`${scanId}-${fieldId}`];
      return next;
    });
    triggerRefresh();
    notifyDataChange();
    toast.success('Field overridden');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-static p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
        >
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Review Queue</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {queue.length} field{queue.length !== 1 ? 's' : ''} pending review
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      {queue.length > 0 && (
        <div className="flex gap-2">
          {(['all', 'HIGH', 'MEDIUM', 'LOW'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium transition-colors cursor-pointer ${
                filter === f ? 'nav-active' : 'hover:bg-[var(--bg-hover)]'
              }`}
              style={{ color: filter === f ? 'var(--primary)' : 'var(--text-secondary)' }}
            >
              {f === 'all' ? 'All' : f} {f !== 'all' && `(${queue.filter(i => i.severity === f).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Queue Items */}
      {filtered.length === 0 ? (
        <div className="card-static p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {queue.length === 0 ? 'No items in review queue' : 'No items match this filter'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {queue.length === 0 ? 'All fields have been reviewed. Scan more products to add items.' : 'Try a different severity filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, idx) => {
            const key = `${item.scanId}-${item.scanFieldId}`;
            return (
              <div key={key} className="card-static p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {FIELD_KEY_TO_LABEL[item.fieldName] ?? item.fieldName}
                      </p>
                      <Badge variant="outline" className={`text-[10px] font-medium ${FIELD_STATUS_COLORS[item.complianceStatus] ?? ''}`}>
                        {item.complianceStatus.replace(/_/g, ' ')}
                      </Badge>
                      {item.severity && (
                        <Badge variant="outline" className={`text-[10px] font-medium ${SEVERITY_COLORS[item.severity] ?? ''}`}>
                          {item.severity}
                        </Badge>
                      )}
                      <ConfidenceBadge score={item.confidence} showScore />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Product: {item.scanProductName}</p>
                    <p className="text-sm mt-1" style={{ color: item.originalValue ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                      Current value: {item.originalValue || <em>Missing</em>}
                    </p>
                    {item.notes && (
                      <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>⚠ {item.notes}</p>
                    )}
                    {item.ruleReference && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Ref: {item.ruleReference}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[200px]">
                    <button
                      onClick={() => handleApprove(item.scanId, item.scanFieldId)}
                      className="btn-ghost w-full justify-center"
                      style={{ color: 'var(--success)' }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </button>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Corrected value..."
                        value={overrideValues[key] ?? ''}
                        onChange={e => setOverrideValues(prev => ({ ...prev, [key]: e.target.value }))}
                        className="input-base flex-1 !py-2 !text-xs"
                      />
                      <button
                        onClick={() => handleOverride(item.scanId, item.scanFieldId)}
                        className="btn-ghost !px-3 !py-2"
                        style={{ color: 'var(--primary)' }}
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
