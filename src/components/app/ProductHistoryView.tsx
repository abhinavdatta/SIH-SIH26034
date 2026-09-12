/* ═══════════════════════════════════════════════════════════════════════════
   Product History — all past scans with search and filter
   All data from localStorage; no API calls.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useMemo } from 'react';
import { History, Search, Trash2, Eye, Filter, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useScans, notifyDataChange } from '@/lib/hooks';
import { deleteScan } from '@/lib/local-data';
import { STATUS_COLORS } from '@/lib/types';
import { useAppStore } from '@/lib/store';

export default function ProductHistoryView() {
  const scans = useScans();
  const { setCurrentView, setSelectedScanId, triggerRefresh } = useAppStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = useMemo(() => {
    return scans.filter(s => {
      const matchesSearch = !search ||
        s.productName.toLowerCase().includes(search.toLowerCase()) ||
        s.manufacturerName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [scans, search, statusFilter]);

  function goToReport(id: string) {
    setSelectedScanId(id);
    setCurrentView('compliance-report');
  }

  function handleDelete(id: string) {
    deleteScan(id);
    triggerRefresh();
    notifyDataChange();
    toast.success('Scan deleted');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-static p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
        >
          <History className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Scan History</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {scans.length} total scan{scans.length !== 1 ? 's' : ''} saved locally
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)] border"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)' }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by product or manufacturer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)] border cursor-pointer"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
        >
          <Filter className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-transparent text-sm outline-none cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <option value="ALL">All Status</option>
            <option value="compliant">Compliant</option>
            <option value="non_compliant">Non-Compliant</option>
            <option value="needs_review">Needs Review</option>
          </select>
        </div>
      </div>

      {/* Scan List */}
      {filtered.length === 0 ? (
        <div className="card-static p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {scans.length === 0 ? 'No scans yet' : 'No matching scans'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {scans.length === 0 ? 'Go to "Scan Product" to check your first product label.' : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(scan => (
            <div key={scan.id} className="card-static p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => goToReport(scan.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{scan.productName}</p>
                    <Badge variant="outline" className={`text-[10px] font-medium ${STATUS_COLORS[scan.status] ?? ''}`}>
                      {scan.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {scan.manufacturerName} · {Math.round(scan.ocrConfidence * 100)}% OCR
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    {new Date(scan.createdAt).toLocaleString('en-IN')} · {scan.violations.length} violation{scan.violations.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => goToReport(scan.id)} className="btn-ghost !p-2" aria-label="View report">
                    <Eye className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                  </button>
                  <button onClick={() => handleDelete(scan.id)} className="btn-ghost !p-2" aria-label="Delete scan">
                    <Trash2 className="h-4 w-4" style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
