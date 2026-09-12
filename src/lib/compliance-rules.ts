// ═══════════════════════════════════════════════════════════════
// Compliance Rules Engine — Legal Metrology (Packaged Commodities) Rules, 2011
// Offline-first: all rules and product data embedded locally.
// ═══════════════════════════════════════════════════════════════

import { generateId, LocalField, LocalViolation, ViolationSeverity, FieldComplianceStatus, ScanStatus } from './types';
import { PRODUCT_FIELDS } from './extract/types';

/* ── Compliance Rule Definitions ── */

interface RuleCheck {
  fieldName: string;
  label: string;
  ruleReference: string;
  check: (value: string | null) => 'compliant' | 'non_compliant' | 'missing' | 'needs_review' | 'not_applicable';
  notes: (value: string | null) => string | null;
  severity: ViolationSeverity;
}

const RULES: RuleCheck[] = [
  {
    fieldName: 'manufacturer_name',
    label: 'Manufacturer Name',
    ruleReference: 'Rule 6(1)(a)',
    check: (v) => { if (!v || v.trim().length === 0) return 'missing'; if (v.trim().length < 2) return 'non_compliant'; return 'compliant'; },
    notes: (v) => { if (!v) return 'Manufacturer name is missing'; if (v.trim().length < 2) return 'Manufacturer name too short'; return null; },
    severity: 'HIGH',
  },
  {
    fieldName: 'manufacturer_address',
    label: 'Manufacturer Address',
    ruleReference: 'Rule 6(1)(a)',
    check: (v) => { if (!v || v.trim().length === 0) return 'missing'; if (v.trim().split(/[\s,]+/).filter(Boolean).length < 3) return 'non_compliant'; return 'compliant'; },
    notes: (v) => { if (!v) return 'Address missing'; if (v.trim().split(/[\s,]+/).filter(Boolean).length < 3) return 'Address incomplete — should include city, state, PIN'; return null; },
    severity: 'HIGH',
  },
  {
    fieldName: 'net_quantity',
    label: 'Net Quantity',
    ruleReference: 'Rule 6(1)(b)',
    check: (v) => { if (!v || v.trim().length === 0) return 'missing'; if (!/^\s*\d+(\.\d+)?\s*(mg|g|kg|ml|l|litre|gram|grams|kilogram|kilograms|millilitre|millilitres)/i.test(v.trim())) return 'non_compliant'; return 'compliant'; },
    notes: (v) => { if (!v) return 'Net quantity missing — mandatory under Rule 6(1)(b)'; if (!/^\s*\d+(\.\d+)?\s*(mg|g|kg|ml|l|litre|gram|grams|kilogram|kilograms|millilitre|millilitres)/i.test(v.trim())) return 'Format incorrect — must be number + standard unit'; return null; },
    severity: 'HIGH',
  },
  {
    fieldName: 'mrp',
    label: 'MRP',
    ruleReference: 'Rule 6(1)(c)',
    check: (v) => { if (!v || v.trim().length === 0) return 'missing'; if (!/^(?:[₹]|Rs\.?|INR)\s*\d+(\.\d{1,2})?/i.test(v.trim())) return 'non_compliant'; return 'compliant'; },
    notes: (v) => { if (!v) return 'MRP missing — mandatory under Rule 6(1)(c)'; if (!/^(?:[₹]|Rs\.?|INR)\s*\d+(\.\d{1,2})?/i.test(v.trim())) return 'MRP format incorrect — must use ₹ or Rs. prefix'; return null; },
    severity: 'HIGH',
  },
  {
    fieldName: 'mrp_inclusive_statement',
    label: 'MRP Inclusive Statement',
    ruleReference: 'Rule 6(1)(c)',
    check: (v) => { if (!v || v.trim().length === 0) return 'missing'; const l = v.toLowerCase(); if (l.includes('inclusive') && l.includes('tax')) return 'compliant'; return 'non_compliant'; },
    notes: (v) => { if (!v) return 'Inclusive-of-taxes statement missing'; if (!v.toLowerCase().includes('inclusive') || !v.toLowerCase().includes('tax')) return 'Does not clearly state MRP is inclusive of taxes'; return null; },
    severity: 'MEDIUM',
  },
  {
    fieldName: 'manufacture_date',
    label: 'Manufacture Date',
    ruleReference: 'Rule 6(1)(d)',
    check: (v) => { if (!v || v.trim().length === 0) return 'missing'; if (/^(0?[1-9]|1[0-2])[\/\-.]\d{4}$/.test(v.trim())) return 'compliant'; if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v.trim())) return 'compliant'; if (/^(best before|mfg|manufactur)/i.test(v.trim())) return 'compliant'; return 'non_compliant'; },
    notes: (v) => { if (!v) return 'Manufacture date missing — mandatory under Rule 6(1)(d)'; return 'Date format not recognized'; },
    severity: 'HIGH',
  },
  {
    fieldName: 'consumer_care',
    label: 'Consumer Care',
    ruleReference: 'Rule 6(1)(e)',
    check: (v) => { if (!v || v.trim().length === 0) return 'missing'; if (/\d{6,}/.test(v) || /[\w.-]+@[\w.-]+\.\w+/.test(v) || /1?800/.test(v)) return 'compliant'; return 'non_compliant'; },
    notes: (v) => { if (!v) return 'Consumer care details missing'; return 'No valid phone, email, or toll-free number found'; },
    severity: 'MEDIUM',
  },
  {
    fieldName: 'other_declarations',
    label: 'Other Declarations',
    ruleReference: 'Rule 6(1)(f)',
    check: () => 'compliant',
    notes: () => null,
    severity: 'LOW',
  },
  /* ── EU CLP Regulation (EC) No 1272/2008 - Advisory Hazard Rules ── */
  {
    fieldName: 'hazard_pictograms',
    label: 'Hazard Pictograms',
    ruleReference: 'EU CLP Annex I (Advisory)',
    check: (v) => {
      if (!v || v.trim().length === 0) return 'not_applicable';
      // If present, check if it contains valid pictogram keywords
      const pictogramKeywords = ['flame', 'skull', 'corrosion', 'exclamation', 'health', 'environment', 'gas', 'exploding', 'warning'];
      const hasValidPictogram = pictogramKeywords.some(keyword => v.toLowerCase().includes(keyword));
      return hasValidPictogram ? 'compliant' : 'needs_review';
    },
    notes: (v) => {
      if (!v) return 'Not applicable for non-hazardous products (food, cosmetics, etc.)';
      const pictogramKeywords = ['flame', 'skull', 'corrosion', 'exclamation', 'health', 'environment', 'gas', 'exploding', 'warning'];
      const hasValidPictogram = pictogramKeywords.some(keyword => v.toLowerCase().includes(keyword));
      return hasValidPictogram ? null : 'Pictogram format not recognized';
    },
    severity: 'LOW',
  },
  {
    fieldName: 'signal_word',
    label: 'Signal Word',
    ruleReference: 'EU CLP Art. 23 (Advisory)',
    check: (v) => {
      if (!v || v.trim().length === 0) return 'not_applicable';
      if (!/^(Danger|Warning|Caution)$/i.test(v.trim())) return 'needs_review';
      return 'compliant';
    },
    notes: (v) => {
      if (!v) return 'Not applicable for non-hazardous products';
      if (!/^(Danger|Warning|Caution)$/i.test(v.trim())) return 'Should be "Danger", "Warning", or "Caution"';
      return null;
    },
    severity: 'LOW',
  },
  {
    fieldName: 'hazard_statements',
    label: 'Hazard Statements',
    ruleReference: 'EU CLP Art. 33 (Advisory)',
    check: (v) => {
      if (!v || v.trim().length === 0) return 'not_applicable';
      // Check if it contains H-codes (H followed by 3 digits)
      const hasHCode = /h\d{3}/i.test(v);
      return hasHCode ? 'compliant' : 'needs_review';
    },
    notes: (v) => {
      if (!v) return 'Not applicable for non-hazardous products';
      if (!/h\d{3}/i.test(v)) return 'Should include H-codes (e.g., H225: Highly flammable liquid and vapour)';
      return null;
    },
    severity: 'LOW',
  },
  {
    fieldName: 'precautionary_statements',
    label: 'Precautionary Statements',
    ruleReference: 'EU CLP Art. 33 (Advisory)',
    check: (v) => {
      if (!v || v.trim().length === 0) return 'not_applicable';
      // Check if it contains P-codes (P followed by 3 digits)
      const hasPCode = /p\d{3}/i.test(v);
      return hasPCode ? 'compliant' : 'needs_review';
    },
    notes: (v) => {
      if (!v) return 'Not applicable for non-hazardous products';
      if (!/p\d{3}/i.test(v)) return 'Should include P-codes (e.g., P210: Keep away from heat, hot surfaces, sparks, open flames)';
      return null;
    },
    severity: 'LOW',
  },
  {
    fieldName: 'first_aid_instructions',
    label: 'First Aid / Overdose Instructions',
    ruleReference: 'EU CLP Art. 34 (Advisory)',
    check: (v) => {
      if (!v || v.trim().length === 0) return 'not_applicable';
      // Check if it contains first aid related keywords
      const firstAidKeywords = ['first aid', 'overdose', 'emergency', 'poison', 'ingestion', 'inhalation', 'skin', 'eye'];
      const hasFirstAidContent = firstAidKeywords.some(keyword => v.toLowerCase().includes(keyword));
      return hasFirstAidContent ? 'compliant' : 'needs_review';
    },
    notes: (v) => {
      if (!v) return 'Not applicable for non-hazardous products';
      const firstAidKeywords = ['first aid', 'overdose', 'emergency', 'poison', 'ingestion', 'inhalation', 'skin', 'eye'];
      const hasFirstAidContent = firstAidKeywords.some(keyword => v.toLowerCase().includes(keyword));
      return hasFirstAidContent ? null : 'Should include first aid or overdose instructions';
    },
    severity: 'LOW',
  },
];

/* ── Public API ── */

export function runComplianceCheckBatch(fields: LocalField[]): { fields: LocalField[]; violations: LocalViolation[] } {
  const updatedFields: LocalField[] = [];
  const violations: LocalViolation[] = [];

  for (const field of fields) {
    const rule = RULES.find((r) => r.fieldName === field.fieldName);
    if (!rule) {
      updatedFields.push(field);
      continue;
    }

    if (field.confidence > 0 && field.confidence < 0.5 && field.value) {
      const updatedField: LocalField = {
        ...field,
        complianceStatus: 'needs_review',
        ruleReference: rule.ruleReference,
        notes: `Low AI confidence (${(field.confidence * 100).toFixed(0)}%) — human review needed`,
      };
      updatedFields.push(updatedField);
      continue;
    }

    const status = rule.check(field.value);
    const notes = rule.notes(field.value);

    const updatedField: LocalField = {
      ...field,
      complianceStatus: status as FieldComplianceStatus,
      ruleReference: rule.ruleReference,
      notes,
    };

    if (status === 'non_compliant' || status === 'missing') {
      updatedField.violationType = rule.fieldName;
      updatedField.violationDescription = notes || `Non-compliant: ${rule.label}`;
      updatedField.severity = rule.severity;

      violations.push({
        id: generateId(),
        scanFieldId: field.id,
        violationType: rule.fieldName,
        description: notes || `Non-compliant: ${rule.label}`,
        severity: rule.severity,
        isOverridden: false,
      });
    }

    updatedFields.push(updatedField);
  }

  return { fields: updatedFields, violations };
}

export function runComplianceCheck(fieldName: string, value: string | null, confidence: number) {
  const rule = RULES.find((r) => r.fieldName === fieldName);
  if (!rule) return { complianceStatus: 'compliant' as const, ruleReference: '', notes: null, violationType: undefined, violationDescription: undefined, severity: undefined };

  if (confidence > 0 && confidence < 0.5 && value) {
    return { complianceStatus: 'needs_review' as const, ruleReference: rule.ruleReference, notes: `Low AI confidence (${(confidence * 100).toFixed(0)}%) — human review needed`, violationType: undefined, violationDescription: undefined, severity: undefined };
  }

  const status = rule.check(value);
  const notes = rule.notes(value);

  const result: { complianceStatus: string; ruleReference: string; notes: string | null; violationType?: string; violationDescription?: string; severity?: string } = {
    complianceStatus: status,
    ruleReference: rule.ruleReference,
    notes,
  };

  if (status === 'non_compliant' || status === 'missing') {
    result.violationType = fieldName;
    result.violationDescription = notes || `Non-compliant: ${rule.label}`;
    result.severity = rule.severity;
  }

  return result;
}

export function getRuleLabel(fieldName: string): string {
  return RULES.find((r) => r.fieldName === fieldName)?.label ?? fieldName;
}

export function getRuleReference(fieldName: string): string {
  return RULES.find((r) => r.fieldName === fieldName)?.ruleReference ?? '';
}

export { RULES };

/* ═══════════════════════════════════════════════════════════════
   Product Scenarios — deterministic data for demo scans.
   Each scenario represents a real Indian product label.
   ═══════════════════════════════════════════════════════════════ */

export interface ProductScenario {
  productName: string;
  manufacturerName: string;
  category: string;
  imageQuery: string;
  fields: Array<{
    fieldName: string;
    value: string | null;
    confidence: number;
  }>;
}

export const PRODUCT_SCENARIOS: ProductScenario[] = [
  {
    productName: 'Amul Taaza Toned Milk',
    manufacturerName: 'GCMMF Ltd.',
    category: 'Dairy',
    imageQuery: 'amul milk packet',
    fields: [
      { fieldName: 'manufacturer_name', value: 'GCMMF Ltd.', confidence: 0.95 },
      { fieldName: 'manufacturer_address', value: 'GCMMF, Anand, Gujarat 388001', confidence: 0.88 },
      { fieldName: 'net_quantity', value: '500 ml', confidence: 0.97 },
      { fieldName: 'mrp', value: '₹26.00', confidence: 0.99 },
      { fieldName: 'mrp_inclusive_statement', value: 'Inclusive of all taxes', confidence: 0.92 },
      { fieldName: 'manufacture_date', value: 'Best Before Jan 2025', confidence: 0.90 },
      { fieldName: 'consumer_care', value: '1800-258-3333, customercare@amul.com', confidence: 0.85 },
      { fieldName: 'other_declarations', value: 'FSSAI Lic No. 10012021001234', confidence: 0.78 },
    ],
  },
  {
    productName: 'Parle-G Biscuits',
    manufacturerName: 'Parle Products Pvt. Ltd.',
    category: 'Bakery',
    imageQuery: 'parle g biscuits packet',
    fields: [
      { fieldName: 'manufacturer_name', value: 'Parle Products Pvt. Ltd.', confidence: 0.97 },
      { fieldName: 'manufacturer_address', value: 'Mumbai', confidence: 0.72 },
      { fieldName: 'net_quantity', value: '100g', confidence: 0.96 },
      { fieldName: 'mrp', value: '₹10.00', confidence: 0.99 },
      { fieldName: 'mrp_inclusive_statement', value: null, confidence: 0 },
      { fieldName: 'manufacture_date', value: 'MFG 06/2024', confidence: 0.91 },
      { fieldName: 'consumer_care', value: '1800-221-8808', confidence: 0.89 },
      { fieldName: 'other_declarations', value: 'Contains wheat, milk solids, edible vegetable oil', confidence: 0.75 },
    ],
  },
  {
    productName: 'Tata Salt',
    manufacturerName: 'Tata Consumer Products Limited',
    category: 'Food Essentials',
    imageQuery: 'tata salt packet india',
    fields: [
      { fieldName: 'manufacturer_name', value: 'Tata Consumer Products Ltd.', confidence: 0.94 },
      { fieldName: 'manufacturer_address', value: 'Mumbai, Maharashtra, India', confidence: 0.87 },
      { fieldName: 'net_quantity', value: '1 kg', confidence: 0.98 },
      { fieldName: 'mrp', value: 'Rs. 28', confidence: 0.96 },
      { fieldName: 'mrp_inclusive_statement', value: 'MRP inclusive of all taxes', confidence: 0.93 },
      { fieldName: 'manufacture_date', value: null, confidence: 0 },
      { fieldName: 'consumer_care', value: 'care@tataconsumer.com', confidence: 0.82 },
      { fieldName: 'other_declarations', value: 'Iodised Salt, FSSAI 10012021004567', confidence: 0.80 },
    ],
  },
  {
    productName: 'Maggi Noodles',
    manufacturerName: 'Nestlé India Ltd.',
    category: 'Instant Food',
    imageQuery: 'maggi noodles packet 2 minute',
    fields: [
      { fieldName: 'manufacturer_name', value: 'Nestlé India Ltd.', confidence: 0.96 },
      { fieldName: 'manufacturer_address', value: 'Nestlé House, Gurgaon, Haryana 122002', confidence: 0.91 },
      { fieldName: 'net_quantity', value: '140 grams', confidence: 0.95 },
      { fieldName: 'mrp', value: '₹14.00', confidence: 0.98 },
      { fieldName: 'mrp_inclusive_statement', value: 'Inclusive of all taxes', confidence: 0.94 },
      { fieldName: 'manufacture_date', value: 'MFG Oct 2024', confidence: 0.89 },
      { fieldName: 'consumer_care', value: '1800-123-4567', confidence: 0.86 },
      { fieldName: 'other_declarations', value: 'FSSAI Lic 10012021007890', confidence: 0.76 },
    ],
  },
  {
    productName: 'Aashirvaad Atta',
    manufacturerName: 'ITC Limited',
    category: 'Food Essentials',
    imageQuery: 'aashirvaad atta 5kg packet',
    fields: [
      { fieldName: 'manufacturer_name', value: 'ITC Limited', confidence: 0.97 },
      { fieldName: 'manufacturer_address', value: 'ITC Ltd., Virginia House, Kolkata', confidence: 0.84 },
      { fieldName: 'net_quantity', value: '5 kg', confidence: 0.99 },
      { fieldName: 'mrp', value: '295', confidence: 0.92 },
      { fieldName: 'mrp_inclusive_statement', value: null, confidence: 0 },
      { fieldName: 'manufacture_date', value: '12/2024', confidence: 0.88 },
      { fieldName: 'consumer_care', value: 'ITC Care', confidence: 0.45 },
      { fieldName: 'other_declarations', value: '100% Whole Wheat Atta, FSSAI', confidence: 0.81 },
    ],
  },
  {
    productName: 'Saffola Gold Oil',
    manufacturerName: 'Marico Limited',
    category: 'Cooking Oil',
    imageQuery: 'saffola gold cooking oil',
    fields: [
      { fieldName: 'manufacturer_name', value: 'Marico Ltd.', confidence: 0.93 },
      { fieldName: 'manufacturer_address', value: 'Mumbai 400053', confidence: 0.75 },
      { fieldName: 'net_quantity', value: '1L', confidence: 0.94 },
      { fieldName: 'mrp', value: '₹199.00', confidence: 0.98 },
      { fieldName: 'mrp_inclusive_statement', value: 'MRP is inclusive of all taxes', confidence: 0.95 },
      { fieldName: 'manufacture_date', value: 'Best Before 09/2025', confidence: 0.87 },
      { fieldName: 'consumer_care', value: '1800-22-8808, customercare@marico.com', confidence: 0.90 },
      { fieldName: 'other_declarations', value: 'Blended Edible Vegetable Oil, FSSAI 10012021005432', confidence: 0.79 },
    ],
  },
];

/* ── Simulate OCR — randomly select a product scenario ── */

export function simulateOCR(): ProductScenario {
  const randomIndex = Math.floor(Math.random() * PRODUCT_SCENARIOS.length);
  return PRODUCT_SCENARIOS[randomIndex];
}

/* ── Process a scenario into a full scan result ── */

export function processScenario(scenario: ProductScenario) {
  const allFields: LocalField[] = [];
  const violations: LocalViolation[] = [];

  for (const pf of PRODUCT_FIELDS) {
    const extracted = scenario.fields.find(f => f.fieldName === pf.key);
    const value = extracted?.value ?? null;
    const confidence = extracted?.confidence ?? 0;

    const check = runComplianceCheck(pf.key, value, confidence);
    const needsReviewFlag = confidence < 0.85 || check.complianceStatus === 'non_compliant' || check.complianceStatus === 'missing' || check.complianceStatus === 'needs_review';

    const field: LocalField = {
      id: generateId(),
      fieldName: pf.key,
      value,
      confidence,
      complianceStatus: check.complianceStatus as LocalField['complianceStatus'],
      ruleReference: check.ruleReference,
      notes: check.notes,
      violationType: check.violationType,
      violationDescription: check.violationDescription,
      severity: check.severity as ViolationSeverity | undefined,
      reviewStatus: (check.complianceStatus === 'compliant' && !needsReviewFlag) ? 'approved' : 'pending',
    };

    allFields.push(field);

    if (check.violationType) {
      violations.push({
        id: generateId(),
        scanFieldId: field.id,
        violationType: check.violationType,
        description: check.violationDescription || `Non-compliant: ${pf.key}`,
        severity: (check.severity as ViolationSeverity) || 'MEDIUM',
        isOverridden: false,
      });
    }
  }

  const hasViolation = violations.length > 0;
  const hasReview = allFields.some(f => f.reviewStatus === 'pending');
  const status: ScanStatus = hasReview ? 'needs_review' : hasViolation ? 'non_compliant' : 'compliant';

  const extractedFields = allFields.filter(f => f.confidence > 0);
  const avgConfidence = extractedFields.length > 0
    ? extractedFields.reduce((sum, f) => sum + f.confidence, 0) / extractedFields.length
    : 0;

  return {
    productName: scenario.productName,
    manufacturerName: scenario.manufacturerName,
    status,
    ocrConfidence: avgConfidence,
    fields: allFields,
    violations,
    createdAt: '',
    id: '',
  };
}

/* ── Process manually entered fields ── */

export function processManualFields(data: {
  productName: string;
  manufacturerName: string;
  fields: { fieldName: string; value: string | null }[];
}) {
  const allFields: LocalField[] = [];
  const violations: LocalViolation[] = [];

  for (const pf of PRODUCT_FIELDS) {
    const extracted = data.fields.find(f => f.fieldName === pf.key);
    const value = extracted?.value ?? null;

    const check = runComplianceCheck(pf.key, value, value ? 0.90 : 0);

    const field: LocalField = {
      id: generateId(),
      fieldName: pf.key,
      value,
      confidence: value ? 0.90 : 0,
      complianceStatus: check.complianceStatus as LocalField['complianceStatus'],
      ruleReference: check.ruleReference,
      notes: check.notes,
      violationType: check.violationType,
      violationDescription: check.violationDescription,
      severity: check.severity as ViolationSeverity | undefined,
      reviewStatus: check.complianceStatus === 'compliant' ? 'approved' : 'pending',
    };

    allFields.push(field);

    if (check.violationType) {
      violations.push({
        id: generateId(),
        scanFieldId: field.id,
        violationType: check.violationType,
        description: check.violationDescription || `Non-compliant: ${pf.key}`,
        severity: (check.severity as ViolationSeverity) || 'MEDIUM',
        isOverridden: false,
      });
    }
  }

  const hasViolation = violations.length > 0;
  const hasReview = allFields.some(f => f.reviewStatus === 'pending');
  const status: ScanStatus = hasReview ? 'needs_review' : hasViolation ? 'non_compliant' : 'compliant';

  return {
    productName: data.productName,
    manufacturerName: data.manufacturerName,
    status,
    ocrConfidence: 0.90,
    fields: allFields,
    violations,
    createdAt: '',
    id: '',
  };
}
