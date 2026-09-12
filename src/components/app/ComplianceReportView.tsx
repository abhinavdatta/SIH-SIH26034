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

  /* Export to PDF */
  function exportToPDF() {
    if (!scan) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Compliance Report', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Product Information
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Product Information', 20, yPosition);
    yPosition += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Product: ${scan.productName}`, 25, yPosition);
    yPosition += 7;
    doc.text(`Manufacturer: ${scan.manufacturerName}`, 25, yPosition);
    yPosition += 7;
    doc.text(`Status: ${scan.status.replace(/_/g, ' ').toUpperCase()}`, 25, yPosition);
    yPosition += 7;
    doc.text(`OCR Confidence: ${(scan.ocrConfidence * 100).toFixed(1)}%`, 25, yPosition);
    yPosition += 7;
    doc.text(`Scan Date: ${new Date(scan.createdAt).toLocaleString()}`, 25, yPosition);
    yPosition += 15;

    // Fields Table
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Field Compliance Details', 20, yPosition);
    yPosition += 10;

    // Table headers
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const headers = ['Field', 'Value', 'Status', 'Confidence'];
    const columnWidths = [50, 70, 30, 30];
    let xPos = 20;

    headers.forEach((header, index) => {
      doc.text(header, xPos, yPosition);
      xPos += columnWidths[index];
    });
    yPosition += 7;

    // Table rows
    doc.setFont('helvetica', 'normal');
    scan.fields.forEach((field) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }

      xPos = 20;
      const label = FIELD_KEY_TO_LABEL[field.fieldName] || field.fieldName;
      const value = field.value || 'Missing';
      const status = field.complianceStatus.replace(/_/g, ' ');
      const confidence = field.confidence > 0 ? `${(field.confidence * 100).toFixed(0)}%` : 'N/A';

      doc.text(label.substring(0, 25), xPos, yPosition, { maxWidth: 50 });
      xPos += columnWidths[0];
      doc.text(value.substring(0, 35), xPos, yPosition, { maxWidth: 70 });
      xPos += columnWidths[1];
      doc.text(status.substring(0, 15), xPos, yPosition, { maxWidth: 30 });
      xPos += columnWidths[2];
      doc.text(confidence, xPos, yPosition);

      yPosition += 7;
    });

    // Violations
    if (scan.violations.length > 0) {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      yPosition += 10;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Violations Found', 20, yPosition);
      yPosition += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      scan.violations.forEach((violation) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }

        doc.text(`• ${violation.violationType}: ${violation.description}`, 25, yPosition);
        doc.text(`  Severity: ${violation.severity}`, 30, yPosition + 5);
        yPosition += 12;
      });
    }

    // Save the PDF
    doc.save(`compliance-report-${scan.id}.pdf`);
    toast.success('PDF report downloaded');
  }

  /* Export to CSV */
  function exportToCSV() {
    if (!scan) return;

    // Create CSV content
    const rows = [
      ['Compliance Report'],
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
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentView('dashboard')}
          className="btn-ghost !p-2"
          aria-label="Go back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>{scan.productName}</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {scan.manufacturerName} · {new Date(scan.createdAt).toLocaleDateString('en-IN')}
          </p>
        </div>
        <Badge variant="outline" className={`text-xs font-medium shrink-0 ${STATUS_COLORS[scan.status] ?? ''}`}>
          {scan.status.replace(/_/g, ' ')}
        </Badge>
        <ConfidenceBadge score={scan.ocrConfidence} showScore size="md" />
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
      <div className="grid grid-cols-3 gap-4">
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
