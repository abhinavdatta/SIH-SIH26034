// ═══════════════════════════════════════════════════════════════
// LMCC Type Definitions
// ═══════════════════════════════════════════════════════════════

export type ViewName =
  | 'dashboard'
  | 'upload-scan'
  | 'review-queue'
  | 'compliance-report'
  | 'product-history'
  | 'product-audit'
  | 'legal-reference'
  | 'ai-providers'
  | 'settings';

export type ScanStatus = 'extracted' | 'needs_review' | 'compliant' | 'non_compliant' | 'completed';
export type FieldComplianceStatus = 'compliant' | 'non_compliant' | 'missing' | 'needs_review' | 'not_applicable';
export type ViolationSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

/* ── Local Storage Data Models ── */

export interface LocalField {
  id: string;
  fieldName: string;
  value: string | null;
  confidence: number;
  complianceStatus: FieldComplianceStatus;
  ruleReference: string | null;
  notes: string | null;
  violationType?: string;
  violationDescription?: string;
  severity?: ViolationSeverity;
  reviewStatus: 'pending' | 'approved' | 'overridden';
}

export interface LocalViolation {
  id: string;
  scanFieldId: string;
  violationType: string;
  description: string;
  severity: ViolationSeverity;
  isOverridden: boolean;
}

export interface LocalScan {
  id: string;
  productName: string;
  manufacturerName: string;
  status: ScanStatus;
  ocrConfidence: number;
  isHazardousProduct: boolean | null; // null = not specified, true = hazardous, false = non-hazardous
  fields: LocalField[];
  violations: LocalViolation[];
  createdAt: string;
}

/* ── Color Mappings for Status Badges ── */

export const STATUS_COLORS: Record<string, string> = {
  extracted: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  needs_review: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  compliant: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
  non_compliant: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800',
  completed: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
};

export const FIELD_STATUS_COLORS: Record<string, string> = {
  compliant: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  non_compliant: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  missing: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
  needs_review: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  not_applicable: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export const SEVERITY_COLORS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400',
  MEDIUM: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
  LOW: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

export const FIELD_KEY_TO_LABEL: Record<string, string> = {
  manufacturer_name: 'Manufacturer Name',
  manufacturer_address: 'Manufacturer Address',
  net_quantity: 'Net Quantity',
  mrp: 'Maximum Retail Price (MRP)',
  mrp_inclusive_statement: 'MRP Inclusive-of-Taxes Statement',
  manufacture_date: 'Month & Year of Manufacture',
  consumer_care: 'Consumer Care Details',
  other_declarations: 'Other Prescribed Declarations',
  hazard_pictograms: 'Hazard Pictograms',
  signal_word: 'Signal Word',
  hazard_statements: 'Hazard Statements (H-codes)',
  precautionary_statements: 'Precautionary Statements (P-codes)',
  first_aid_instructions: 'First Aid / Overdose Instructions',
};

/* ── Utility: generate a simple unique ID ── */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
