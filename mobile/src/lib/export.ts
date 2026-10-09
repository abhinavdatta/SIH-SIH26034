// ═══════════════════════════════════════════════════════════════
// Export — stamped CSV + print-ready PDF report from a native app.
//
// The web app exports via jspdf; on native we build the same stamped
// artifacts with expo-print (HTML → PDF) and the new expo-file-system
// File API (CSV), then hand both to the OS share sheet via expo-sharing.
// Every export records WHO produced it (getExportStamp from auth).
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { LocalScan } from './local-data';
import { getExportStamp } from './auth';
import { FIELD_KEY_TO_LABEL } from './types';
import { SCAN_STATUS_META, FIELD_STATUS_META, fileStamp } from '@/theme';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** One row per declared field, with the scan's identity repeated on each row. */
export function scansToCsv(scans: LocalScan[]): string {
  const header = [
    'Scan ID',
    'Product',
    'Manufacturer',
    'Scan Status',
    'OCR Confidence',
    'Scanned At',
    'Field',
    'Field Label',
    'Value',
    'Confidence',
    'Compliance',
    'Rule Reference',
    'Severity',
    'Review Status',
    'Notes',
  ].join(',');

  const rows: string[] = [];
  for (const scan of scans) {
    for (const field of scan.fields) {
      rows.push(
        [
          esc(scan.id),
          esc(scan.productName),
          esc(scan.manufacturerName),
          esc(SCAN_STATUS_META[scan.status]?.label ?? scan.status),
          esc(scan.ocrConfidence ? scan.ocrConfidence.toFixed(2) : ''),
          esc(scan.createdAt),
          esc(field.fieldName),
          esc(FIELD_KEY_TO_LABEL[field.fieldName] ?? field.fieldName),
          esc(field.value),
          esc(field.confidence ? field.confidence.toFixed(2) : ''),
          esc(FIELD_STATUS_META[field.complianceStatus]?.label ?? field.complianceStatus),
          esc(field.ruleReference),
          esc(field.severity ?? ''),
          esc(field.reviewStatus),
          esc(field.notes),
        ].join(',')
      );
    }
  }
  return [header, ...rows].join('\n');
}

async function shareTextFile(name: string, content: string, mimeType: string): Promise<boolean> {
  try {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create({ overwrite: true });
    file.write(content);
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'LMCC export' });
    return true;
  } catch {
    return false;
  }
}

/** CSV of one scan (compliance report data) → OS share sheet. */
export async function shareScanCsv(scan: LocalScan): Promise<boolean> {
  const csv = scansToCsv([scan]);
  // Stamp rides along as a comment row after the header.
  const stamped = `${csv}\n${esc(getExportStamp()).slice(1, -1)}\n`;
  return shareTextFile(`lmcc-scan-${scan.id}-${fileStamp()}.csv`, stamped, 'text/csv');
}

/** CSV of the entire local history → OS share sheet. */
export async function shareHistoryCsv(scans: LocalScan[]): Promise<boolean> {
  const stamped = `${scansToCsv(scans)}\n${getExportStamp()}\n`;
  return shareTextFile(`lmcc-history-${fileStamp()}.csv`, stamped, 'text/csv');
}

/* ── PDF report ── */

function escHtml(s: string): string {
  // \u0026 renders as an ampersand at runtime, keeping entity text out of source.
  return s
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;');
}

const STATUS_HEX: Record<string, string> = {
  compliant: '#10B981',
  non_compliant: '#EF4444',
  missing: '#64748B',
  needs_review: '#F59E0B',
  not_applicable: '#94A3B8',
};

/** Formatted, print-ready compliance report (same content as the web PDF). */
export function scanReportHtml(scan: LocalScan): string {
  const violations = scan.violations.filter((v) => !v.isOverridden);
  const fieldRows = scan.fields
    .map((field) => {
      const label = FIELD_KEY_TO_LABEL[field.fieldName] ?? field.fieldName;
      const color = STATUS_HEX[field.complianceStatus] ?? '#334155';
      const value = field.value ?? '— not declared —';
      const notes = field.notes ? `<div class="note">${escHtml(field.notes)}</div>` : '';
      return `
      <tr>
        <td><strong>${escHtml(label)}</strong><div class="rule">${escHtml(field.ruleReference ?? '')}</div>${notes}</td>
        <td>${escHtml(value)}</td>
        <td style="color:${color};font-weight:700;white-space:nowrap;">${escHtml(FIELD_STATUS_META[field.complianceStatus]?.label ?? field.complianceStatus)}</td>
      </tr>`;
    })
    .join('');

  const violationRows = violations
    .map(
      (v) => `
      <tr>
        <td>${escHtml(FIELD_KEY_TO_LABEL[v.violationType] ?? v.violationType)}</td>
        <td>${escHtml(v.description)}</td>
        <td style="color:${v.severity === 'HIGH' ? '#EF4444' : v.severity === 'MEDIUM' ? '#F59E0B' : '#64748B'};font-weight:700;">${escHtml(v.severity)}</td>
      </tr>`
    )
    .join('');

  return `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, Roboto, 'Segoe UI', sans-serif; color: #0F172A; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { color: #64748B; font-size: 12px; margin-bottom: 18px; }
      .meta { background:#F1F5F9; border-radius:8px; padding:10px 14px; font-size:12px; color:#334155; margin-bottom:18px; }
      h2 { font-size:14px; margin:20px 0 8px; text-transform:uppercase; letter-spacing:0.6px; color:#475569; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th { text-align:left; background:#E2E8F0; padding:7px 10px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#334155;}
      td { padding:7px 10px; border-bottom:1px solid #E2E8F0; vertical-align:top; }
      .rule { color:#94A3B8; font-size:10px; margin-top:2px; }
      .note { color:#64748B; font-size:10px; font-style:italic; margin-top:2px; }
      .stamp { margin-top:26px; padding-top:10px; border-top:1px solid #CBD5E1; color:#475569; font-size:10px; }
      .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:700; color:#fff;
        background:${SCAN_STATUS_META[scan.status]?.tone === 'green' ? '#10B981' : SCAN_STATUS_META[scan.status]?.tone === 'red' ? '#EF4444' : SCAN_STATUS_META[scan.status]?.tone === 'amber' ? '#F59E0B' : '#3B82F6'}; }
    </style>
  </head>
  <body>
    <h1>⚖️ ${escHtml(scan.productName)}</h1>
    <div class="sub">${escHtml(scan.manufacturerName)}</div>
    <div class="meta">
      <span class="badge">${escHtml(SCAN_STATUS_META[scan.status]?.label ?? scan.status)}</span>
      &nbsp; OCR confidence: ${scan.ocrConfidence ? Math.round(scan.ocrConfidence * 100) + '%' : '—'}
      &nbsp;·&nbsp; Scanned: ${escHtml(new Date(scan.createdAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC')}
    </div>

    <h2>Violations (${violations.length})</h2>
    ${
      violations.length === 0
        ? '<p style="font-size:12px;color:#10B981;"><strong>No unresolved violations.</strong></p>'
        : `<table><tr><th>Field</th><th>Finding</th><th>Severity</th></tr>${violationRows}</table>`
    }

    <h2>Declared fields (${scan.fields.length})</h2>
    <table>
      <tr><th>Declaration</th><th>Value</th><th>Status</th></tr>
      ${fieldRows}
    </table>

    <div class="stamp">
      ${escHtml(getExportStamp())}<br/>
      LMCC — Legal Metrology Compliance Checker · github.com/abhinavdatta
    </div>
  </body>
  </html>`;
}

/** HTML → PDF via expo-print → OS share sheet. */
export async function shareScanPdf(scan: LocalScan): Promise<boolean> {
  try {
    const { uri } = await Print.printToFileAsync({ html: scanReportHtml(scan) });
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'LMCC compliance report', UTI: 'com.adobe.pdf' });
    return true;
  } catch {
    return false;
  }
}
