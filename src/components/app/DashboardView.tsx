/* ═══════════════════════════════════════════════════════════════════════════
   Dashboard — Overview with stats, charts, and recent scans
   All data sourced from localStorage; no API calls required.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useDashboard } from '@/lib/hooks';
import { useAppStore } from '@/lib/store';
import { STATUS_COLORS, FIELD_KEY_TO_LABEL } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableRow, TableHead, TableCell, TableBody,
} from '@/components/ui/table';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
} from 'recharts';
import {
  ScanLine, CheckCircle2, XCircle, ArrowRight, TrendingUp,
} from 'lucide-react';

/* Chart color mapping */
const PIE_COLORS: Record<string, string> = {
  compliant: '#10B981',
  non_compliant: '#EF4444',
  needs_review: '#F59E0B',
  extracted: '#94A3B8',
  completed: '#3B82F6',
};

/* ── Stat Card ── */

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="card-static p-5">
      <div className="flex items-start gap-3.5">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: `${color}12`, color }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {label}
          </p>
          <p className="text-2xl font-bold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Main Dashboard Component ── */

export default function DashboardView() {
  const data = useDashboard();
  const { setCurrentView, setSelectedScanId } = useAppStore();

  /* Prepare chart data - handle null data during SSR */
  const pieData = (data?.scansByStatus ?? []).map((s: { status: string; count: number }) => ({
    name: s.status.replace(/_/g, ' '),
    value: s.count,
    color: PIE_COLORS[s.status] || '#94A3B8',
  }));

  const barData = (data?.violationByType ?? []).slice(0, 6).map((v: { type: string; count: number }) => ({
    name: v.type.length > 18 ? v.type.slice(0, 18) + '…' : v.type,
    count: v.count,
  }));

  function goToReport(id: string) {
    setSelectedScanId(id);
    setCurrentView('compliance-report');
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Welcome Banner */}
      <div className="card-static p-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Legal Metrology Compliance Checker
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Verify packaged commodity labels against the LM (Packaged Commodities) Rules, 2011.
            All processing happens offline on your device.
          </p>
        </div>
        <button
          onClick={() => setCurrentView('upload-scan')}
          className="btn-primary shrink-0"
        >
          <ScanLine className="h-4 w-4" /> New Scan
        </button>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<ScanLine className="h-5 w-5" />}
          label="Total Scans"
          value={data?.totalScans ?? 0}
          sub={`${data?.needsReviewScans ?? 0} need review`}
          color="#3B82F6"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Compliant"
          value={data?.compliantScans ?? 0}
          color="#10B981"
        />
        <StatCard
          icon={<XCircle className="h-5 w-5" />}
          label="Non-Compliant"
          value={data?.nonCompliantScans ?? 0}
          color="#EF4444"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Violation Rate"
          value={`${(data?.violationRate ?? 0).toFixed(0)}%`}
          color="#F59E0B"
        />
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pie Chart — Scan Status */}
        <div className="card-static p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Scan Status Distribution
          </h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border-default)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    formatter={(val: number) => [`${val} scans`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 justify-center">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: entry.color }} />
                    {entry.name} ({entry.value})
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[210px] flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No data yet — scan your first product
            </div>
          )}
        </div>

        {/* Bar Chart — Violation Types */}
        <div className="card-static p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Violation Types
          </h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                <RTooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border-default)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[210px] flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No violations recorded
            </div>
          )}
        </div>
      </div>

      {/* Top Violated Fields */}
      {(data?.topViolatedFields ?? []).length > 0 && (
        <div className="card-static p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Top Violated Fields</h3>
          <div className="space-y-3">
            {(data?.topViolatedFields ?? []).slice(0, 5).map((f, i) => {
              const topFields = data?.topViolatedFields ?? [];
              const maxCount = topFields[0]?.count || 1;
              const pct = (f.count / maxCount) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-44 shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {FIELD_KEY_TO_LABEL[f.fieldName] ?? f.fieldName}
                  </span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: 'var(--primary)', transition: 'width .5s ease' }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-6 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{f.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Scans Table */}
      <div className="card-static p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Scans</h3>
          <button
            onClick={() => setCurrentView('product-history')}
            className="text-xs font-medium hover:underline flex items-center gap-1 cursor-pointer"
            style={{ color: 'var(--primary)' }}
          >
            View All <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {(data?.recentScans ?? []).length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>
            No scans yet. Click &quot;New Scan&quot; to get started.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <Table className="clean-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">Manufacturer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Violations</TableHead>
                  <TableHead className="hidden md:table-cell">OCR</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.recentScans ?? []).map((scan) => (
                  <TableRow
                    key={scan.id}
                    className="cursor-pointer"
                    onClick={() => goToReport(scan.id)}
                  >
                    <TableCell className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {scan.productName || 'Unknown Product'}
                    </TableCell>
                    <TableCell className="text-sm hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {scan.manufacturerName || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] font-medium ${STATUS_COLORS[scan.status] ?? ''}`}>
                        {scan.status?.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      <span
                        className="font-medium tabular-nums"
                        style={{ color: scan.violationsCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}
                      >
                        {scan.violationsCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {Math.round(scan.ocrConfidence * 100)}%
                    </TableCell>
                    <TableCell className="text-xs hidden lg:table-cell" style={{ color: 'var(--text-muted)' }}>
                      {new Date(scan.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
