// ═══════════════════════════════════════════════════════════════
// Local Data — localStorage-based client-side storage for scans
// Compatible with the hybrid OCR + AI analysis architecture.
// ═══════════════════════════════════════════════════════════════

import {
  generateId,
  LocalField,
  LocalScan,
  LocalViolation,
  ViolationSeverity,
} from './types';
import { runComplianceCheck } from './compliance-rules';
import {
  PRODUCT_SCENARIOS,
  processScenario,
} from './compliance-rules';
import { PRODUCT_FIELDS } from './extract/types';

/* ── Export Types ── */

export type {
  LocalScan,
  LocalField,
  LocalViolation,
  ViolationSeverity,
};

/* ── Storage Keys ── */

const STORAGE_KEY = 'lmcc_scans_v1';
const SEEDED_KEY = 'lmcc_seeded_v1';
const STATUS_MIGRATION_KEY = 'lmcc_status_migration_v2';

/*
 * Demo seeding gate: signed-in users get their REAL scans from their
 * account (server sync) — seeding fake demo scans into their dashboard
 * is pollution, not helpfulness. The app flips this off once auth state
 * is known; default on so anonymous first-run still gets demo data.
 */
let demoSeedingEnabled = true;

export function setDemoSeedingEnabled(enabled: boolean): void {
  demoSeedingEnabled = enabled;
}

/* ── Storage Helpers ── */

/**
 * All localStorage access is guarded so this module is safe to import
 * during Next.js SSR/building.
 */
function loadScans(): LocalScan[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    // Keep malformed records from breaking the entire application.
    return parsed.filter(isLocalScan);
  } catch {
    return [];
  }
}

function saveScans(scans: LocalScan[]): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
    return true;
  } catch {
    // Handles quota/security errors without crashing a scan.
    return false;
  }
}

function isSeeded(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(SEEDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function markSeeded(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SEEDED_KEY, 'true');
  } catch {
    // Ignore storage failures. The app can continue without seeding.
  }
}

/* ── Runtime Validation ── */

function isLocalScan(value: unknown): value is LocalScan {
  if (!value || typeof value !== 'object') return false;

  const scan = value as Partial<LocalScan>;

  return (
    typeof scan.id === 'string' &&
    typeof scan.productName === 'string' &&
    typeof scan.manufacturerName === 'string' &&
    typeof scan.status === 'string' &&
    typeof scan.ocrConfidence === 'number' &&
    Array.isArray(scan.fields) &&
    Array.isArray(scan.violations) &&
    typeof scan.createdAt === 'string'
  );
}

/* ── Scan Construction ── */

function buildScan(data: {
  productName: string;
  manufacturerName: string;
  fields: LocalField[];
  violations: LocalViolation[];
  ocrConfidence: number;
  createdAt?: string;
}): LocalScan {
  // Violations outrank pending reviews: a scan with an active violation is
  // non_compliant even if some fields also await review. Previously
  // pending-review always won, which (together with the not_applicable bug)
  // trapped every scan in needs_review and kept dashboard stats at 0.
  const hasViolation = data.violations.some(v => !v.isOverridden);
  const hasPendingReview = data.fields.some(
    field => field.reviewStatus === 'pending'
  );

  const status: LocalScan['status'] = hasViolation
    ? 'non_compliant'
    : hasPendingReview
      ? 'needs_review'
      : 'compliant';

  return {
    id: generateId(),
    productName: data.productName || 'Unknown Product',
    manufacturerName: data.manufacturerName || 'Unknown Manufacturer',
    status,
    ocrConfidence: clampConfidence(data.ocrConfidence),
    isHazardousProduct: null,
    fields: data.fields,
    violations: data.violations,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/* ── Cross-device sync helpers (used by scan-sync.ts) ── */

/**
 * Union-merge server scans into the local cache by id. LOCAL WINS on id
 * conflicts (the device in hand is the freshest editor); server-only
 * scans are appended. Returns the number of scans added/updated.
 */
export function mergeScansFromServer(serverScans: unknown): number {
  if (typeof window === 'undefined' || !Array.isArray(serverScans)) return 0;
  const incoming = serverScans.filter(isLocalScan);
  if (incoming.length === 0) return 0;

  const scans = loadScans();
  const byId = new Map(scans.map((s) => [s.id, s]));
  let changed = 0;
  for (const remote of incoming) {
    if (!byId.has(remote.id)) {
      byId.set(remote.id, remote);
      changed += 1;
    }
  }
  if (changed > 0) saveScans(Array.from(byId.values()));
  return changed;
}

/** Snapshot of all scans for pushing to the server account. */
export function exportScansForSync(): LocalScan[] {
  return loadScans();
}

/**
 * Clear the local scan cache (shared-device sign-out). The server copy
 * is untouched — it re-hydrates on the next sign-in from any device.
 */
export function clearLocalScanCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(SEEDED_KEY);
  } catch {
    // Storage unavailable
  }
}

/**
 * Persists a scan and returns the stored scan.
 *
 * This is useful for the real hybrid OCR/AI pipeline: OCR and AI can
 * produce the fields first, then local-data.ts can persist the final
 * combined result without using the old demo-scenario path.
 */
export function saveScan(scan: LocalScan): LocalScan {
  const scans = loadScans();

  const existingIndex = scans.findIndex(existing => existing.id === scan.id);

  if (existingIndex >= 0) {
    scans[existingIndex] = scan;
  } else {
    scans.unshift(scan);
  }

  saveScans(scans);
  return scan;
}

/**
 * Backward-compatible wrapper used by the upload flow.
 *
 * Older UI code still calls createScanFromOCR(...) with OCR result metadata,
 * while the current local-data pipeline exposes createScanFromFields(...).
 * This adapter normalizes both shapes into the same persisted scan format.
 */
export function createScanFromOCR(data: {
  productName?: string | null;
  manufacturerName?: string | null;
  fields?: Array<{
    fieldName: string;
    value: string | null;
    confidence?: number;
    status?: string;
    sourceText?: string;
    notes?: string | null;
  }>;
  overallConfidence?: number;
  complianceStatus?: string;
} = {}, _uploadedFile?: File | null): LocalScan {
  const normalizedFields = (data.fields ?? []).map(field => ({
    fieldName: field.fieldName,
    value: field.value ?? null,
    confidence: clampConfidence(field.confidence ?? 0),
    notes: field.notes ?? field.sourceText ?? null,
  }));

  return createScanFromFields({
    productName: data.productName,
    manufacturerName: data.manufacturerName,
    fields: normalizedFields,
    ocrConfidence: data.overallConfidence,
  });
}

/**
 * Creates and persists a scan from already-extracted fields.
 *
 * This is the preferred entry point for the hybrid OCR/AI pipeline.
 * The extraction itself belongs in ocr.ts / the AI provider layer;
 * this module only stores the result and runs deterministic compliance
 * checks for the supplied fields.
 */
export function createScanFromFields(data: {
  productName?: string | null;
  manufacturerName?: string | null;
  fields: Array<{
    fieldName: string;
    value: string | null;
    confidence?: number;
    notes?: string | null;
  }>;
  ocrConfidence?: number;
}): LocalScan {
  const localFields: LocalField[] = [];
  const violations: LocalViolation[] = [];

  for (const fieldDefinition of PRODUCT_FIELDS) {
    const extracted = data.fields.find(
      field => field.fieldName === fieldDefinition.key
    );

    const value = extracted?.value ?? null;
    const confidence = clampConfidence(extracted?.confidence ?? 0);

    const check = runComplianceCheck(
      fieldDefinition.key,
      value,
      confidence
    );

    // Only statuses a human must actually look at require review.
    // `not_applicable` (EU CLP hazard fields on ordinary food labels) was
    // previously treated as requiring review, which put EVERY scan into
    // needs_review forever — dashboard compliant/non-compliant/violation-rate
    // stayed 0 no matter how many scans ran.
    const requiresReview =
      (confidence > 0 && confidence < 0.85) ||
      check.complianceStatus === 'non_compliant' ||
      check.complianceStatus === 'missing' ||
      check.complianceStatus === 'needs_review';

    const field: LocalField = {
      id: generateId(),
      fieldName: fieldDefinition.key,
      value,
      confidence,
      complianceStatus:
        check.complianceStatus as LocalField['complianceStatus'],
      ruleReference: check.ruleReference || null,
      notes: extracted?.notes ?? check.notes,
      violationType: check.violationType,
      violationDescription: check.violationDescription,
      severity: check.severity as ViolationSeverity | undefined,
      reviewStatus: requiresReview ? 'pending' : 'approved',
    };

    localFields.push(field);

    if (check.violationType) {
      violations.push({
        id: generateId(),
        scanFieldId: field.id,
        violationType: check.violationType,
        description:
          check.violationDescription ||
          `Non-compliant: ${fieldDefinition.label}`,
        severity:
          (check.severity as ViolationSeverity) || 'MEDIUM',
        isOverridden: false,
      });
    }
  }

  const extractedFields = localFields.filter(
    field => field.confidence > 0
  );

  const calculatedConfidence =
    extractedFields.length > 0
      ? extractedFields.reduce(
          (sum, field) => sum + field.confidence,
          0
        ) / extractedFields.length
      : 0;

  const scan = buildScan({
    productName: data.productName ?? 'Unknown Product',
    manufacturerName:
      data.manufacturerName ?? 'Unknown Manufacturer',
    fields: localFields,
    violations,
    ocrConfidence:
      data.ocrConfidence ?? calculatedConfidence,
  });

  return saveScan(scan);
}

/**
 * Re-runs the compliance engine over edited declarations and REPLACES the
 * existing scan in place (same id, same position, same createdAt) — used by
 * the Scan History "Edit" flow. Returns the updated scan, or null if the id
 * is unknown.
 */
export function updateScanFromFields(
  id: string,
  data: Parameters<typeof createScanFromFields>[0]
): LocalScan | null {
  const existing = getScanById(id);
  if (!existing) return null;

  // Reuse the full pipeline (field checks, violations, status, confidence),
  // then restore identity fields so history position and timestamps survive.
  const rebuilt = createScanFromFields(data);
  const updated: LocalScan = {
    ...rebuilt,
    id: existing.id,
    createdAt: existing.createdAt,
  };
  return saveScan(updated);
}

/**
 * Fixes scans stored before the status-rule fixes:
 * 1. Fields whose compliance is `not_applicable` (EU CLP hazard fields on
 *    ordinary products) were marked pending review forever → approve them.
 * 2. Scan status precedence was needs_review > non_compliant → recalculate
 *    with violation-first precedence.
 *
 * Runs once (flag in localStorage), from the app mount effect — never during
 * render. Returns the number of scans changed (for logging).
 */
export function migrateScanStatuses(): number {
  if (typeof window === 'undefined') return 0;

  try {
    if (window.localStorage.getItem(STATUS_MIGRATION_KEY) === 'true') return 0;

    const scans = loadScans();
    let changed = 0;

    for (const scan of scans) {
      let scanChanged = false;

      for (const field of scan.fields) {
        if (field.complianceStatus === 'not_applicable' && field.reviewStatus === 'pending') {
          field.reviewStatus = 'approved';
          scanChanged = true;
        }
      }

      recalculateScanStatus(scan);

      if (scanChanged) {
        changed++;
      }
    }

    if (changed > 0) {
      saveScans(scans);
    }
    window.localStorage.setItem(STATUS_MIGRATION_KEY, 'true');
    return changed;
  } catch {
    return 0;
  }
}

/* ── Seed Demo Data ── */

export function seedDemoData(): void {
  if (isSeeded()) return;
  if (!demoSeedingEnabled) {
    markSeeded(); // signed-in: never pollute the account with demo rows
    return;
  }

  const demoScans: LocalScan[] = [];

  // Seed the first three deterministic demo scenarios.
  for (let i = 0; i < Math.min(3, PRODUCT_SCENARIOS.length); i++) {
    const scenario = PRODUCT_SCENARIOS[i];
    const result = processScenario(scenario);

    const scan: LocalScan = {
      id: generateId(),
      productName: result.productName,
      manufacturerName: result.manufacturerName,
      status: result.status,
      ocrConfidence: clampConfidence(result.ocrConfidence),
      isHazardousProduct: null,
      fields: result.fields,
      violations: result.violations,
      createdAt: new Date(
        Date.now() - i * 24 * 60 * 60 * 1000
      ).toISOString(),
    };

    demoScans.push(scan);
  }

  // Never overwrite existing user scans if the seed flag was missing.
  const existing = loadScans();

  if (existing.length === 0) {
    saveScans(demoScans);
  }

  markSeeded();
}

/* ── Demo Product Scan ── */

/**
 * Kept for the existing demo UI.
 *
 * This function is deterministic: it selects the requested scenario
 * rather than randomly choosing a product.
 */
export function runProductScan(productIndex: number): LocalScan {
  if (PRODUCT_SCENARIOS.length === 0) {
    throw new Error('No demo product scenarios are configured.');
  }

  const safeIndex =
    ((Math.trunc(productIndex) % PRODUCT_SCENARIOS.length) +
      PRODUCT_SCENARIOS.length) %
    PRODUCT_SCENARIOS.length;

  const scenario = PRODUCT_SCENARIOS[safeIndex];
  const result = processScenario(scenario);

  const scan: LocalScan = {
    id: generateId(),
    productName: result.productName,
    manufacturerName: result.manufacturerName,
    status: result.status,
    ocrConfidence: clampConfidence(result.ocrConfidence),
    isHazardousProduct: null,
    fields: result.fields,
    violations: result.violations,
    createdAt: new Date().toISOString(),
  };

  saveScan(scan);
  return scan;
}

/* ── CRUD Operations ── */

export function getAllScans(): LocalScan[] {
  seedDemoData();
  return loadScans();
}

export function getScanById(id: string): LocalScan | null {
  if (!id) return null;

  const scans = loadScans();
  return scans.find(scan => scan.id === id) ?? null;
}

export function deleteScan(id: string): boolean {
  if (!id) return false;

  const scans = loadScans();
  const filtered = scans.filter(scan => scan.id !== id);

  if (filtered.length === scans.length) return false;

  return saveScans(filtered);
}

/* ── Review Queue ── */

export interface ReviewQueueItem {
  id: string;
  scanId: string;
  scanFieldId: string;
  scanProductName: string;
  scanManufacturerName: string;
  fieldName: string;
  fieldLabel: string;
  originalValue: string | null;
  confidence: number;
  complianceStatus: LocalField['complianceStatus'];
  ruleReference: string | null;
  notes: string | null;
  violationType?: string;
  violationDescription?: string;
  severity?: ViolationSeverity;
  reviewStatus: LocalField['reviewStatus'];

  // FIX: ReviewQueueItem previously used createdAt while the interface
  // did not define it. Keep it here so sorting is type-safe.
  createdAt: string;
}

export function getReviewQueue(): ReviewQueueItem[] {
  const scans = loadScans();
  const queue: ReviewQueueItem[] = [];

  for (const scan of scans) {
    for (const field of scan.fields) {
      if (field.reviewStatus !== 'pending') continue;

      const fieldDefinition = PRODUCT_FIELDS.find(
        definition => definition.key === field.fieldName
      );

      queue.push({
        id: `${scan.id}-${field.id}`,
        scanId: scan.id,
        scanFieldId: field.id,
        scanProductName: scan.productName,
        scanManufacturerName: scan.manufacturerName,
        fieldName: field.fieldName,
        fieldLabel:
          fieldDefinition?.label ?? field.fieldName,
        originalValue: field.value,
        confidence: clampConfidence(field.confidence),
        complianceStatus: field.complianceStatus,
        ruleReference: field.ruleReference,
        notes: field.notes,
        violationType: field.violationType,
        violationDescription: field.violationDescription,
        severity: field.severity,
        reviewStatus: field.reviewStatus,
        createdAt: scan.createdAt,
      });
    }
  }

  return queue.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );
}

/* ── Update Field Review ── */

export interface UpdateFieldReviewOptions {
  reviewStatus?: 'approved' | 'overridden';
  value?: string;
}

/**
 * Approve a field review or override it with a corrected value.
 *
 * Pass `{ reviewStatus: 'approved' }` to approve as-is, or
 * `{ value: '<corrected>', reviewStatus: 'overridden' }` to override —
 * overriding re-runs the deterministic compliance check on the new value.
 */
export function updateFieldReview(
  scanId: string,
  fieldId: string,
  options: UpdateFieldReviewOptions
): { success: boolean; updatedScan?: LocalScan } {
  if (!scanId || !fieldId) {
    return { success: false };
  }

  if (!options.reviewStatus && options.value === undefined) {
    return { success: false };
  }

  const isOverride =
    options.value !== undefined ||
    options.reviewStatus === 'overridden';

  const scans = loadScans();
  const scanIndex = scans.findIndex(
    scan => scan.id === scanId
  );

  if (scanIndex === -1) {
    return { success: false };
  }

  // Work on a new object so callers do not accidentally hold a
  // reference to the mutable localStorage representation.
  const scan: LocalScan = {
    ...scans[scanIndex],
    fields: scans[scanIndex].fields.map(field => ({ ...field })),
    violations: scans[scanIndex].violations.map(violation => ({
      ...violation,
    })),
  };

  const fieldIndex = scan.fields.findIndex(
    field => field.id === fieldId
  );

  if (fieldIndex === -1) {
    return { success: false };
  }

  const field = scan.fields[fieldIndex];

  if (!isOverride) {
    field.reviewStatus = 'approved';
  } else {
    if (options.value === undefined) {
      return { success: false };
    }

    const newValue = options.value;

    field.value = newValue;
    field.reviewStatus = options.reviewStatus ?? 'approved';

    // Re-run the deterministic compliance rule using the corrected value.
    const check = runComplianceCheck(
      field.fieldName,
      newValue,
      field.confidence
    );

    field.complianceStatus =
      check.complianceStatus as LocalField['complianceStatus'];
    field.ruleReference = check.ruleReference || null;
    field.notes = check.notes;

    if (check.violationType) {
      const existingViolationIndex =
        scan.violations.findIndex(
          violation => violation.scanFieldId === field.id
        );

      const violation: LocalViolation = {
        id:
          existingViolationIndex >= 0
            ? scan.violations[existingViolationIndex].id
            : generateId(),
        scanFieldId: field.id,
        violationType: check.violationType,
        description:
          check.violationDescription ||
          `Non-compliant: ${field.fieldName}`,
        severity:
          (check.severity as ViolationSeverity) || 'MEDIUM',
        isOverridden: false,
      };

      if (existingViolationIndex >= 0) {
        scan.violations[existingViolationIndex] = violation;
      } else {
        scan.violations.push(violation);
      }

      field.violationType = check.violationType;
      field.violationDescription =
        check.violationDescription;
      field.severity =
        check.severity as ViolationSeverity | undefined;
    } else {
      // The corrected value is now compliant, so remove any old
      // violation associated with this field.
      scan.violations = scan.violations.filter(
        violation => violation.scanFieldId !== field.id
      );

      field.violationType = undefined;
      field.violationDescription = undefined;
      field.severity = undefined;
    }
  }

  recalculateScanStatus(scan);

  scans[scanIndex] = scan;

  if (!saveScans(scans)) {
    return { success: false };
  }

  return {
    success: true,
    updatedScan: scan,
  };
}

/* ── Status Recalculation ── */

function recalculateScanStatus(scan: LocalScan): void {
  // Violation-first precedence, matching buildScan (see comment there).
  const hasActiveViolation = scan.violations.some(
    violation => !violation.isOverridden
  );

  const hasPendingReview = scan.fields.some(
    field => field.reviewStatus === 'pending'
  );

  scan.status = hasActiveViolation
    ? 'non_compliant'
    : hasPendingReview
      ? 'needs_review'
      : 'compliant';

  const extractedFields = scan.fields.filter(
    field => field.confidence > 0
  );

  scan.ocrConfidence =
    extractedFields.length > 0
      ? extractedFields.reduce(
          (sum, field) => sum + clampConfidence(field.confidence),
          0
        ) / extractedFields.length
      : 0;
}

/* ── Dashboard Stats ── */

export interface DashboardStats {
  totalScans: number;
  compliantScans: number;
  nonCompliantScans: number;
  needsReviewScans: number;
  extractedScans: number;
  violationRate: number;

  recentScans: Array<{
    id: string;
    productName: string;
    manufacturerName: string;
    status: string;
    violationsCount: number;
    ocrConfidence: number;
    createdAt: string;
  }>;

  violationByType: Array<{
    type: string;
    count: number;
  }>;

  scansByStatus: Array<{
    status: string;
    count: number;
  }>;

  topViolatedFields: Array<{
    fieldName: string;
    fieldLabel: string;
    count: number;
  }>;
}

export function getDashboardStats(): DashboardStats {
  const scans = loadScans();

  const totalScans = scans.length;
  const compliantScans = scans.filter(
    scan => scan.status === 'compliant'
  ).length;
  const nonCompliantScans = scans.filter(
    scan => scan.status === 'non_compliant'
  ).length;
  const needsReviewScans = scans.filter(
    scan => scan.status === 'needs_review'
  ).length;
  const extractedScans = scans.filter(
    scan => scan.status === 'extracted'
  ).length;

  const violationRate =
    totalScans > 0
      ? (nonCompliantScans / totalScans) * 100
      : 0;

  const recentScans = scans
    .slice(0, 10)
    .map(scan => ({
      id: scan.id,
      productName: scan.productName,
      manufacturerName: scan.manufacturerName,
      status: scan.status,
      violationsCount: scan.violations.filter(
        violation => !violation.isOverridden
      ).length,
      ocrConfidence: clampConfidence(scan.ocrConfidence),
      createdAt: scan.createdAt,
    }));

  /* ── Violations by Type ── */

  const violationTypeMap = new Map<string, number>();

  for (const scan of scans) {
    for (const violation of scan.violations) {
      if (violation.isOverridden) continue;

      violationTypeMap.set(
        violation.violationType,
        (violationTypeMap.get(violation.violationType) ?? 0) + 1
      );
    }
  }

  const violationByType = Array.from(
    violationTypeMap.entries()
  )
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  /* ── Scans by Status ── */

  const scansByStatus = [
    { status: 'compliant', count: compliantScans },
    { status: 'non_compliant', count: nonCompliantScans },
    { status: 'needs_review', count: needsReviewScans },
    { status: 'extracted', count: extractedScans },
  ];

  /* ── Top Violated Fields ── */

  const fieldViolationMap = new Map<
    string,
    { fieldName: string; fieldLabel: string; count: number }
  >();

  for (const scan of scans) {
    for (const field of scan.fields) {
      if (!field.violationType) continue;

      const fieldDefinition = PRODUCT_FIELDS.find(
        definition => definition.key === field.fieldName
      );

      const existing = fieldViolationMap.get(field.fieldName);

      fieldViolationMap.set(field.fieldName, {
        fieldName: field.fieldName,
        fieldLabel:
          fieldDefinition?.label ?? field.fieldName,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  const topViolatedFields = Array.from(
    fieldViolationMap.values()
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalScans,
    compliantScans,
    nonCompliantScans,
    needsReviewScans,
    extractedScans,
    violationRate,
    recentScans,
    violationByType,
    scansByStatus,
    topViolatedFields,
  };
}

/* ── Clear All Data ── */

export function clearAllData(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(SEEDED_KEY);
  } catch {
    // Ignore storage/security errors.
  }
}
