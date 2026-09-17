/* ═══════════════════════════════════════════════════════════════════════════
   Compliance Report — detailed field-by-field analysis for a single scan
   All data from localStorage; no API calls.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, Shield, FileText, Save, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { useScan, notifyDataChange } from '@/lib/hooks';
import { updateFieldReview } from '@/lib/local-data';
import { FIELD_KEY_TO_LABEL, FIELD_STATUS_COLORS, SEVERITY_COLORS, STATUS_COLORS } from '@/lib/types';
import { ConfidenceBadge } from '@/components/confidence-badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getExportStamp, getExportStampShort, WATERMARK_LINE } from '@/lib/auth';

export default function ComplianceReportView() {
  const { selectedScanId, setCurrentView } = useAppStore();
  const scan = useScan(selectedScanId ?? '');
  const { triggerRefresh } = useAppStore();
  const [overrideValue, setOverrideValue] = useState<Record<string, string>>({});

  /* Empty state — no scan selected */
  if (!scan || !selectedScanId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 animate-fade-in">
        <div className="card-static p-8">
          <Shield className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>No Scan Selected</h3>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            Go to &quot;Scan Product&quot; to run a compliance check first.
          </p>
          <button
            onClick={() => setCurrentView('upload-scan')}
            className="btn-primary mt-6"
          >
            Scan a Product
          </button>
        </div>
      </div>
    );
  }

  /* Review actions */
  function handleApprove(fieldId: string) {
    if (!selectedScanId) {
      toast.error('No scan selected');
      return;
    }
    updateFieldReview(selectedScanId, fieldId, { reviewStatus: 'approved' });
    triggerRefresh();
    notifyDataChange();
    toast.success('Field approved');
  }

  function handleOverride(fieldId: string) {
    if (!selectedScanId) {
      toast.error('No scan selected');
      return;
    }
    const val = overrideValue[fieldId];
    if (!val?.trim()) { toast.error('Please enter a corrected value'); return; }
    updateFieldReview(selectedScanId, fieldId, { value: val, reviewStatus: 'overridden' });
    triggerRefresh();
    notifyDataChange();
    toast.success('Field overridden with corrected value');
  }

  /* Export to PDF — autoTable layout: real cell padding, wrapping, zebra rows */
  function exportToPDF() {
    if (!scan) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const M = 14; // page margin (mm)
    const stamp = getExportStampShort();
    const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;

    /** Draw a section heading, page-breaking first when it would orphan
        near the page bottom (heading + table head + ≥1 row must fit). */
    const drawHeading = (text: string, afterY: number, bold = true): number => {
      let y = afterY + 9;
      if (y > pageHeight - 48) {
        doc.addPage();
        y = 30; // below the continuation band drawn later
      }
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 11 : 9.5);
      doc.setTextColor(...(bold ? [15, 23, 42] : [4, 120, 87]) as [number, number, number]);
      doc.text(text, M, y);
      doc.setTextColor(0);
      return y + 5; // table startY just below the heading
    };

    doc.setProperties({
      title: `Compliance Report — ${scan.productName}`,
      subject: 'Legal Metrology (Packaged Commodities) Rules, 2011',
      creator: `LMCC · ${WATERMARK_LINE}`,
    });

    /* ── Header band ── */
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setFillColor(139, 92, 246);
    doc.rect(0, 26, pageWidth, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('Compliance Report', M, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(199, 210, 254);
    doc.text('Legal Metrology (Packaged Commodities) Rules, 2011 — field-by-field audit', M, 18.5);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - M, 12, { align: 'right' });
    doc.setTextColor(0);

    /* ── Product information — label/value grid ── */
    autoTable(doc, {
      startY: 33,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.2, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [51, 65, 85] },
        1: { cellWidth: 'auto' },
      },
      body: [
        ['Product', scan.productName || '—'],
        ['Manufacturer', scan.manufacturerName || '—'],
        ['Overall status', scan.status.replace(/_/g, ' ').toUpperCase()],
        ['OCR confidence', `${(scan.ocrConfidence * 100).toFixed(1)}%`],
        ['Scan date', new Date(scan.createdAt).toLocaleString()],
        ['Exported by', stamp],
      ],
    });

    /* ── Field compliance table ── */
    autoTable(doc, {
      startY: drawHeading('Field compliance details', lastY()),
      margin: { left: M, right: M, top: 30 },
      theme: 'grid',
      head: [['Field', 'Extracted value', 'Status', 'Conf.', 'Rule']],
      body: scan.fields.map((f) => [
        FIELD_KEY_TO_LABEL[f.fieldName] || f.fieldName,
        f.value || '— (missing)',
        f.complianceStatus.replace(/_/g, ' '),
        f.confidence > 0 ? `${Math.round(f.confidence * 100)}%` : 'N/A',
        f.ruleReference || '—',
      ]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5, fontStyle: 'bold', cellPadding: 2.4 },
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 2.4, right: 2.6, bottom: 2.4, left: 2.6 },
        overflow: 'linebreak',
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
        textColor: [15, 23, 42],
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold', textColor: [51, 65, 85] },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 26, halign: 'center' },
        3: { cellWidth: 14, halign: 'right' },
        4: { cellWidth: 28, textColor: [100, 116, 139], fontSize: 8 },
      },
      rowPageBreak: 'avoid',
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 2) return;
        const raw = String(data.cell.raw ?? '');
        const tints: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
          compliant: { bg: [236, 253, 245], fg: [4, 120, 87] },
          non_compliant: { bg: [254, 226, 226], fg: [185, 28, 28] },
          missing: { bg: [241, 245, 249], fg: [71, 85, 105] },
          needs_review: { bg: [254, 243, 199], fg: [180, 83, 9] },
          not_applicable: { bg: [243, 244, 246], fg: [75, 85, 99] },
        };
        const tint = tints[raw];
        if (tint) {
          data.cell.styles.fillColor = tint.bg;
          data.cell.styles.textColor = tint.fg;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    /* ── Violations table ── */
    const activeViolations = scan.violations.filter((v) => !v.isOverridden);
    if (scan.violations.length > 0) {
      autoTable(doc, {
        startY: drawHeading(`Violations (${activeViolations.length} active of ${scan.violations.length})`, lastY()),
        margin: { left: M, right: M, top: 30 },
        theme: 'grid',
        head: [['#', 'Severity', 'Type', 'Description']],
        body: scan.violations.map((v, i) => [
          String(i + 1),
          v.severity,
          v.violationType.replace(/_/g, ' '),
          v.description,
        ]),
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5, fontStyle: 'bold', cellPadding: 2.4 },
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 2.4, right: 2.6, bottom: 2.4, left: 2.6 },
          overflow: 'linebreak',
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [15, 23, 42],
          valign: 'middle',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center', textColor: [100, 116, 139] },
          1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 42 },
          3: { cellWidth: 'auto' },
        },
        rowPageBreak: 'avoid',
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index !== 1) return;
          const raw = String(data.cell.raw ?? '');
          const tints: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
            HIGH: { bg: [254, 226, 226], fg: [185, 28, 28] },
            MEDIUM: { bg: [254, 243, 199], fg: [180, 83, 9] },
            LOW: { bg: [241, 245, 249], fg: [71, 85, 105] },
          };
          const tint = tints[raw];
          if (tint) {
            data.cell.styles.fillColor = tint.bg;
            data.cell.styles.textColor = tint.fg;
          }
        },
      });
    } else {
      drawHeading('No violations detected — all fields reviewed and compliant.', lastY(), false);
    }

    /* ── Page furniture: continuation band + footer on every page ── */
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);
      if (page > 1) {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 13, 'F');
        doc.setFillColor(139, 92, 246);
        doc.rect(0, 13, pageWidth, 0.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Compliance Report — continued', M, 8.5);
        doc.setTextColor(0);
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(M, pageHeight - 12, pageWidth - M, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 130, 150);
      doc.text(`${WATERMARK_LINE}  ·  ${stamp}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - M, pageHeight - 7, { align: 'right' });
      doc.setTextColor(0);
    }

    /* Save — filename readable instead of a raw scan id */
    const slug = (scan.productName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    doc.save(`compliance-report-${slug || scan.id}.pdf`);
    toast.success('PDF report downloaded');
  }

  /* Export to CSV */
  function exportToCSV() {
    if (!scan) return;

    // Create CSV content — identity stamp first so the exporter is always recorded
    const rows = [
      ['Compliance Report'],
      [getExportStamp()],
      ['Product', scan.productName],
      ['Manufacturer', scan.manufacturerName],
      ['Status', scan.status],
      ['OCR Confidence', `${(scan.ocrConfidence * 100).toFixed(1)}%`],
      ['Scan Date', new Date(scan.createdAt).toISOString()],
      [],
      ['Field', 'Value', 'Status', 'Confidence', 'Rule Reference', 'Notes'],
      ...scan.fields.map(field => [
        FIELD_KEY_TO_LABEL[field.fieldName] || field.fieldName,
        field.value || 'Missing',
        field.complianceStatus,
        field.confidence > 0 ? `${(field.confidence * 100).toFixed(0)}%` : 'N/A',
        field.ruleReference || 'N/A',
        field.notes || 'N/A',
      ]),
      [],
      ['Violations'],
      ...scan.violations.map(v => [
        v.violationType,
        v.description,
        v.severity,
        v.isOverridden ? 'Overridden' : 'Active',
      ]),
    ];

    // Convert to CSV string
    const csvContent = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `compliance-report-${scan.id}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV report downloaded');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Back + Header — wraps on phones so the action icons never
          squash the product name or overlap the badges */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setCurrentView('dashboard')}
          className="btn-ghost !p-2"
          aria-label="Go back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-[140px]">
          <h2 className="text-lg font-bold break-words" style={{ color: 'var(--text-primary)' }}>{scan.productName}</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {scan.manufacturerName} · {new Date(scan.createdAt).toLocaleDateString('en-IN')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-xs font-medium ${STATUS_COLORS[scan.status] ?? ''}`}>
            {scan.status.replace(/_/g, ' ')}
          </Badge>
          <ConfidenceBadge score={scan.ocrConfidence} showScore size="md" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToPDF}
            className="btn-ghost !p-2"
            aria-label="Export to PDF"
            title="Export to PDF"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={exportToCSV}
            className="btn-ghost !p-2"
            aria-label="Export to CSV"
            title="Export to CSV"
          >
            <FileText className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="card-static p-4 text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--success)' }}>
            {scan.fields.filter(f => f.complianceStatus === 'compliant').length}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Compliant</p>
        </div>
        <div className="card-static p-4 text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--danger)' }}>{scan.violations.length}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Violations</p>
        </div>
        <div className="card-static p-4 text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--warning)' }}>
            {scan.fields.filter(f => f.reviewStatus === 'pending').length}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Needs Review</p>
        </div>
      </div>

      {/* Field-by-Field Analysis */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Field-by-Field Analysis</h3>
        </div>

        <div className="space-y-3">
          {scan.fields.map((field) => {
            const label = FIELD_KEY_TO_LABEL[field.fieldName] ?? field.fieldName;
            const isPending = field.reviewStatus === 'pending';

            return (
              <div
                key={field.id}
                className="rounded-[var(--radius-md)] p-4 border"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-light)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                      <Badge variant="outline" className={`text-[10px] font-medium ${FIELD_STATUS_COLORS[field.complianceStatus] ?? ''}`}>
                        {field.complianceStatus.replace(/_/g, ' ')}
                      </Badge>
                      {field.confidence > 0 && <ConfidenceBadge score={field.confidence} showScore />}
                    </div>
                    <p className="text-sm mt-1" style={{ color: field.value ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                      {field.value || <em>Not detected on label</em>}
                    </p>
                    {field.notes && (
                      <p className="text-xs mt-1" style={{ color: field.complianceStatus === 'compliant' ? 'var(--text-muted)' : 'var(--danger)' }}>
                        {field.complianceStatus === 'compliant' ? '✓' : '⚠'} {field.notes}
                      </p>
                    )}
                    {field.ruleReference && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Reference: {field.ruleReference}</p>
                    )}
                  </div>

                  {/* Review Actions */}
                  {isPending && (
                    <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[200px]">
                      <button
                        onClick={() => handleApprove(field.id)}
                        className="btn-ghost w-full justify-center"
                        style={{ color: 'var(--success)' }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Corrected value..."
                          value={overrideValue[field.id] ?? ''}
                          onChange={e => setOverrideValue(prev => ({ ...prev, [field.id]: e.target.value }))}
                          className="input-base flex-1 !py-2 !text-xs"
                        />
                        <button
                          onClick={() => handleOverride(field.id)}
                          className="btn-ghost !px-3 !py-2"
                          style={{ color: 'var(--primary)' }}
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Violations Table */}
      {scan.violations.length > 0 && (
        <div className="card-static p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4" style={{ color: 'var(--danger)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Violations ({scan.violations.length})
            </h3>
          </div>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full clean-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Description</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {scan.violations.map(v => (
                  <tr key={v.id}>
                    <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {FIELD_KEY_TO_LABEL[v.violationType] ?? v.violationType}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{v.description}</td>
                    <td>
                      <Badge variant="outline" className={`text-[10px] font-medium ${SEVERITY_COLORS[v.severity] ?? ''}`}>{v.severity}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fully Compliant Message */}
      {scan.violations.length === 0 && (
        <div className="card-static p-8 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fully Compliant</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            This product label meets all mandatory requirements under the Legal Metrology Rules, 2011.
          </p>
        </div>
      )}
    </div>
  );
}
