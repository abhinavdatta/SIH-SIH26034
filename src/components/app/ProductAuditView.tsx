/* ═══════════════════════════════════════════════════════════════════════════
   Product Declarations Audit — manual entry form (Seller role) mirroring the
   MetaCheck Pro reference layout: declarations, manufacturer/importer,
   quantities & pricing, dates, customer care. Runs the same compliance
   engine as OCR scans, then persists a scan that shows up in History,
   Review Queue, and the Dashboard.

   Repo: github.com/abhinavdatta
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useMemo, useState } from 'react';
import { Loader2, FileSearch, ClipboardList, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { notifyDataChange } from '@/lib/hooks';
import { createScanFromFields, updateScanFromFields, getScanById } from '@/lib/local-data';
import { runComplianceCheck } from '@/lib/compliance-rules';
import { useAuth, getExportStampShort } from '@/lib/auth';
import type { LocalScan } from '@/lib/types';

/* ── Form model (screenshot parity) ── */

interface AuditForm {
  productName: string;
  brandName: string;
  category: string;
  countryOfOrigin: string;
  description: string;
  manufacturerName: string;
  manufacturerAddress: string;
  importerName: string;
  importerAddress: string;
  netQuantity: string;
  unit: string;
  mrp: string;
  manufactureDate: string;
  expiryDate: string;
  helplinePhone: string;
  helplineEmail: string;
}

const EMPTY_FORM: AuditForm = {
  productName: '',
  brandName: '',
  category: 'Food & Beverages',
  countryOfOrigin: 'India',
  description: '',
  manufacturerName: '',
  manufacturerAddress: '',
  importerName: '',
  importerAddress: '',
  netQuantity: '',
  unit: 'g (grams)',
  mrp: '',
  manufactureDate: '',
  expiryDate: '',
  helplinePhone: '',
  helplineEmail: '',
};

const METROLOGY_CATEGORIES = [
  'Food & Beverages',
  'Cosmetics',
  'Pharmaceuticals',
  'Household Goods',
  'Electronics',
  'Textiles',
  'Other',
];

const UNITS = [
  'g (grams)',
  'kg (kilograms)',
  'ml (millilitres)',
  'L (litres)',
  'cm (centimetres)',
  'm (metres)',
  'pieces',
];

/** dd-mm-yyyy display; native date inputs give yyyy-mm-dd. */
function formatDisplayDate(iso: string): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

/* ── Small building blocks ── */

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:col-span-2">
      <h3
        className="text-[11px] font-bold uppercase tracking-wider pt-2"
        style={{ color: 'var(--text-muted)' }}
      >
        {children}
      </h3>
    </div>
  );
}

const inputClass = 'input-base w-full text-sm';

/** Reverse of the submit mapping: turn a stored scan back into form values. */
function scanToForm(scan: LocalScan): AuditForm {
  const byName = new Map(scan.fields.map((f) => [f.fieldName, f.value ?? '']));
  const manufacturerFull = byName.get('manufacturer_name') ?? '';
  // Strip the " (Imported by: …)" suffix the submit path appends
  const importerMatch = manufacturerFull.match(/\s*\(Imported by: ([^,]+), (.+)\)$/);
  const netQty = byName.get('net_quantity') ?? '';
  const qtyMatch = netQty.match(/^([\d.]+)\s*(.+)$/);
  const unitValue = qtyMatch?.[2] ?? '';
  const unit = UNITS.find((u) => u.startsWith(`${unitValue} `)) ?? 'g (grams)';
  const mrp = (byName.get('mrp') ?? '').replace(/^₹/, '');
  const consumerCare = byName.get('consumer_care') ?? '';
  const declarations = (byName.get('other_declarations') ?? '').split(' · ');
  return {
    productName: scan.productName.split(' — ')[0] ?? '',
    brandName: scan.productName.split(' — ').slice(1).join(' — '),
    category: declarations[0] ?? 'Food & Beverages',
    countryOfOrigin: declarations[1] ?? 'India',
    description: declarations.slice(2).join(' · '),
    manufacturerName: importerMatch ? manufacturerFull.slice(0, manufacturerFull.length - importerMatch[0].length).trim() : manufacturerFull,
    manufacturerAddress: byName.get('manufacturer_address') ?? '',
    importerName: importerMatch?.[1]?.trim() ?? '',
    importerAddress: importerMatch?.[2]?.trim() ?? '',
    netQuantity: qtyMatch?.[1] ?? netQty,
    unit,
    mrp,
    manufactureDate: toInputDate(byName.get('manufacture_date') ?? ''),
    expiryDate: '',
    helplinePhone: consumerCare.split(',')[0]?.trim() ?? '',
    helplineEmail: consumerCare.split(',')[1]?.trim() ?? '',
  };
}

/** dd-mm-yyyy (stored) → yyyy-mm-dd (native date input). */
function toInputDate(display: string): string {
  const m = display.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/* ── Main view ── */

export default function ProductAuditView() {
  const { setCurrentView, setSelectedScanId, editingScanId, setEditingScanId } = useAppStore();
  const { user } = useAuth();
  const editingScan = editingScanId ? getScanById(editingScanId) : null;
  const [form, setForm] = useState<AuditForm>(() => (editingScan ? scanToForm(editingScan) : EMPTY_FORM));
  const [lastPrefilledId, setLastPrefilledId] = useState<string | null>(editingScanId);
  const [submitting, setSubmitting] = useState(false);

  /* Re-prefill when the edit target changes while the form is open (e.g. the
     user picked a different product from Scan History) — render-time state
     adjustment pattern, no effect needed. */
  if (editingScanId !== lastPrefilledId) {
    setLastPrefilledId(editingScanId);
    setForm(editingScan ? scanToForm(editingScan) : EMPTY_FORM);
  }

  /** Pre-submit engine preview so sellers see issues before committing. */
  const preview = useMemo(() => {
    const fields: Array<{ fieldName: string; value: string | null }> = [
      { fieldName: 'manufacturer_name', value: form.manufacturerName || null },
      { fieldName: 'manufacturer_address', value: form.manufacturerAddress || null },
      { fieldName: 'net_quantity', value: form.netQuantity ? `${form.netQuantity} ${form.unit.split(' ')[0]}` : null },
      { fieldName: 'mrp', value: form.mrp ? `₹${form.mrp}` : null },
      { fieldName: 'manufacture_date', value: formatDisplayDate(form.manufactureDate) },
      { fieldName: 'consumer_care', value: [form.helplinePhone, form.helplineEmail].filter(Boolean).join(', ') || null },
      { fieldName: 'other_declarations', value: form.description || null },
    ];
    return fields.map((f) => ({
      ...f,
      result: runComplianceCheck(f.fieldName, f.value, f.value ? 0.9 : 0),
    }));
  }, [form]);

  const violationCount = preview.filter((p) => p.result.violationType).length;

  function set<K extends keyof AuditForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.productName.trim() || !form.manufacturerName.trim() || !form.netQuantity.trim() || !form.mrp.trim()) {
      toast.error('Please fill all required fields');
      return;
    }
    if (!user) {
      toast.error('You must be signed in to audit a product');
      return;
    }

    setSubmitting(true);
    try {
      const importerNote =
        form.importerName.trim() && form.importerAddress.trim()
          ? ` (Imported by: ${form.importerName}, ${form.importerAddress})`
          : '';

      const payload = {
        productName: form.brandName.trim()
          ? `${form.productName.trim()} — ${form.brandName.trim()}`
          : form.productName.trim(),
        manufacturerName: form.manufacturerName.trim(),
        fields: [
          {
            fieldName: 'manufacturer_name',
            value: `${form.manufacturerName.trim()}${importerNote}`,
            confidence: 0.95,
            notes: 'Manual declaration entry',
          },
          { fieldName: 'manufacturer_address', value: form.manufacturerAddress.trim() || null, confidence: 0.95, notes: 'Manual declaration entry' },
          {
            fieldName: 'net_quantity',
            value: `${form.netQuantity.trim()} ${form.unit.split(' ')[0]}`,
            confidence: 0.95,
            notes: 'Manual declaration entry',
          },
          { fieldName: 'mrp', value: `₹${form.mrp.trim()}`, confidence: 0.95, notes: 'Manual declaration entry' },
          { fieldName: 'manufacture_date', value: formatDisplayDate(form.manufactureDate), confidence: 0.95, notes: 'Manual declaration entry' },
          {
            fieldName: 'consumer_care',
            value: [form.helplinePhone.trim(), form.helplineEmail.trim()].filter(Boolean).join(', ') || null,
            confidence: 0.95,
            notes: 'Manual declaration entry',
          },
          {
            fieldName: 'other_declarations',
            value: [form.category, form.countryOfOrigin, form.description.trim()].filter(Boolean).join(' · ') || null,
            confidence: 0.9,
            notes: 'Manual declaration entry',
          },
        ],
        ocrConfidence: 1,
      };

      const isEdit = Boolean(editingScanId);
      const scan = isEdit ? updateScanFromFields(editingScanId!, payload) : createScanFromFields(payload);
      if (!scan) throw new Error('Scan not found');

      notifyDataChange();
      toast.success(isEdit ? 'Audit updated' : 'Audit complete', {
        description: isEdit
          ? 'Changes saved in place — the original scan was updated.'
          : 'Saved to Scan History. Open the report to review and export.',
      });

      setEditingScanId(null);
      setSelectedScanId(scan.id);
      setCurrentView('compliance-report');
    } catch (err) {
      console.error('[Product Audit] submission failed:', err, getExportStampShort());
      toast.error('Audit failed. Please check the form and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-static p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
        >
          <FileSearch className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {editingScanId ? 'Edit Product Declarations' : 'Product Declarations Audit'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Verify packaging declarations against Legal Metrology (Packaged Commodities) Rules, 2011
          </p>
        </div>
        {violationCount > 0 && (
          <Badge variant="outline" className="text-[11px] font-medium text-red-600 border-red-200 dark:border-red-800 shrink-0">
            <AlertCircle className="h-3 w-3 mr-1" />
            {violationCount} issue{violationCount !== 1 ? 's' : ''} detected
          </Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Declarations form */}
        <div className="card-static p-6">
          <div className="flex items-center gap-2 mb-5">
            <ClipboardList className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Enter Legal Metrology Declarations
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Common / Generic Product Name" required htmlFor="audit-product-name">
              <input
                id="audit-product-name"
                type="text"
                className={inputClass}
                placeholder="e.g. Whey Protein Powders"
                value={form.productName}
                onChange={(e) => set('productName', e.target.value)}
                required
              />
            </Field>
            <Field label="Brand Name" htmlFor="audit-brand">
              <input
                id="audit-brand"
                type="text"
                className={inputClass}
                placeholder="e.g. NutritionPlus"
                value={form.brandName}
                onChange={(e) => set('brandName', e.target.value)}
              />
            </Field>

            <Field label="Metrology Category" required htmlFor="audit-category">
              <select
                id="audit-category"
                className={inputClass}
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {METROLOGY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Country of Origin" required htmlFor="audit-origin">
              <input
                id="audit-origin"
                type="text"
                className={inputClass}
                placeholder="e.g. India (do not enter abbreviation)"
                value={form.countryOfOrigin}
                onChange={(e) => set('countryOfOrigin', e.target.value)}
                required
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Product Description (include batch / package declarations)" htmlFor="audit-description">
                <textarea
                  id="audit-description"
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Provide retail description details. Add batch no. if applicable."
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
            </div>

            <SectionTitle>Manufacturer / Importer Details</SectionTitle>

            <Field label="Manufacturer Name" required htmlFor="audit-mfr-name">
              <input
                id="audit-mfr-name"
                type="text"
                className={inputClass}
                placeholder="Legal corporate entity name"
                value={form.manufacturerName}
                onChange={(e) => set('manufacturerName', e.target.value)}
                required
              />
            </Field>
            <Field label="Manufacturer Address" required htmlFor="audit-mfr-address">
              <input
                id="audit-mfr-address"
                type="text"
                className={inputClass}
                placeholder="Plot, Sector, City, Pincode"
                value={form.manufacturerAddress}
                onChange={(e) => set('manufacturerAddress', e.target.value)}
                required
              />
            </Field>
            <Field label="Importer Name (mandatory for imported items)" htmlFor="audit-imp-name">
              <input
                id="audit-imp-name"
                type="text"
                className={inputClass}
                placeholder="Leave blank for Indian products"
                value={form.importerName}
                onChange={(e) => set('importerName', e.target.value)}
              />
            </Field>
            <Field label="Importer Address (mandatory for imported items)" htmlFor="audit-imp-address">
              <input
                id="audit-imp-address"
                type="text"
                className={inputClass}
                placeholder="Registered office address of importer"
                value={form.importerAddress}
                onChange={(e) => set('importerAddress', e.target.value)}
              />
            </Field>

            <SectionTitle>Quantities &amp; Pricing</SectionTitle>

            <Field label="Net Quantity" required htmlFor="audit-net-qty">
              <input
                id="audit-net-qty"
                type="text"
                inputMode="decimal"
                className={inputClass}
                placeholder="e.g. 500, 1.5"
                value={form.netQuantity}
                onChange={(e) => set('netQuantity', e.target.value)}
                required
              />
            </Field>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-4">
              <Field label="Unit" required htmlFor="audit-unit">
                <select
                  id="audit-unit"
                  className={inputClass}
                  value={form.unit}
                  onChange={(e) => set('unit', e.target.value)}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="MRP (in ₹)" required htmlFor="audit-mrp">
                <input
                  id="audit-mrp"
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Amount inclusive of all taxes"
                  value={form.mrp}
                  onChange={(e) => set('mrp', e.target.value)}
                  required
                />
              </Field>
            </div>

            <Field label="Manufacturing / Packaging Date" required htmlFor="audit-mfg-date">
              <input
                id="audit-mfg-date"
                type="date"
                className={inputClass}
                value={form.manufactureDate}
                onChange={(e) => set('manufactureDate', e.target.value)}
                required
              />
            </Field>
            <Field label="Expiry Date (if applicable)" htmlFor="audit-exp-date">
              <input
                id="audit-exp-date"
                type="date"
                className={inputClass}
                value={form.expiryDate}
                onChange={(e) => set('expiryDate', e.target.value)}
              />
            </Field>

            <SectionTitle>Customer Care Mandatory Notice</SectionTitle>

            <Field label="Helpline Number" htmlFor="audit-phone">
              <input
                id="audit-phone"
                type="tel"
                className={inputClass}
                placeholder="Toll-free or standard helpline"
                value={form.helplinePhone}
                onChange={(e) => set('helplinePhone', e.target.value)}
              />
            </Field>
            <Field label="Helpline Email" htmlFor="audit-email">
              <input
                id="audit-email"
                type="email"
                className={inputClass}
                placeholder="customer.support@brand.com"
                value={form.helplineEmail}
                onChange={(e) => set('helplineEmail', e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-5 border-t" style={{ borderColor: 'var(--border-light)' }}>
            <button
              type="button"
              onClick={() => {
                setEditingScanId(null);
                setForm(EMPTY_FORM);
              }}
              className="btn-ghost"
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingScanId ? 'Save Changes' : 'Audit Product Details'}
            </button>
          </div>
        </div>
      </form>

      {/* Live pre-flight check */}
      <div className="card-static p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Live Compliance Preview
        </h3>
        <div className="space-y-2">
          {preview.map((p) => {
            const compliant = p.result.complianceStatus === 'compliant';
            return (
              <div key={p.fieldName} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
                  {p.fieldName.replace(/_/g, ' ')}
                  {p.value ? `: ${p.value}` : ''}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-medium shrink-0 ${
                    p.result.complianceStatus === 'missing'
                      ? 'text-slate-500 border-slate-300 dark:border-slate-700'
                      : compliant
                        ? 'text-emerald-600 border-emerald-200 dark:border-emerald-800'
                        : 'text-amber-600 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {compliant ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> : <AlertCircle className="h-2.5 w-2.5 mr-1" />}
                  {p.result.complianceStatus.replace(/_/g, ' ')}
                </Badge>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
          Preview only — the full engine runs on submit and the result is saved to Scan History with your identity stamped.
        </p>
      </div>
    </div>
  );
}
