// ═══════════════════════════════════════════════════════════════
// EXTRACTION SCHEMA — mandatory declarations under the Legal
// Metrology (Packaged Commodities) Rules, 2011 (India)
// + EU CLP Regulation (EC) No 1272/2008 hazard fields (advisory tier)
// ═══════════════════════════════════════════════════════════════

export const PRODUCT_FIELDS = [
  // Legal Metrology 2011 - Mandatory Fields
  { key: 'manufacturer_name', label: 'Manufacturer Name', group: 'identity', tier: 'legal_metrology_2011' },
  { key: 'manufacturer_address', label: 'Manufacturer Address', group: 'identity', tier: 'legal_metrology_2011' },
  { key: 'net_quantity', label: 'Net Quantity', group: 'quantity', tier: 'legal_metrology_2011' },
  { key: 'mrp', label: 'Maximum Retail Price (MRP)', group: 'pricing', tier: 'legal_metrology_2011' },
  { key: 'mrp_inclusive_statement', label: 'MRP Inclusive-of-Taxes', group: 'pricing', tier: 'legal_metrology_2011' },
  { key: 'manufacture_date', label: 'Month & Year of Manufacture', group: 'date', tier: 'legal_metrology_2011' },
  { key: 'consumer_care', label: 'Consumer Care Details', group: 'contact', tier: 'legal_metrology_2011' },
  { key: 'other_declarations', label: 'Other Prescribed Declarations', group: 'other', tier: 'legal_metrology_2011' },
  
  // EU CLP Regulation (EC) No 1272/2008 - Advisory Hazard Fields
  { key: 'hazard_pictograms', label: 'Hazard Pictograms', group: 'hazard', tier: 'eu_clp_reference' },
  { key: 'signal_word', label: 'Signal Word', group: 'hazard', tier: 'eu_clp_reference' },
  { key: 'hazard_statements', label: 'Hazard Statements (H-codes)', group: 'hazard', tier: 'eu_clp_reference' },
  { key: 'precautionary_statements', label: 'Precautionary Statements (P-codes)', group: 'hazard', tier: 'eu_clp_reference' },
  { key: 'first_aid_instructions', label: 'First Aid / Overdose Instructions', group: 'hazard', tier: 'eu_clp_reference' },
] as const;

export type ProductFieldKey = (typeof PRODUCT_FIELDS)[number]['key'];
export type FieldTier = 'legal_metrology_2011' | 'eu_clp_reference';

export const FIELD_GROUPS = [
  { key: 'identity', label: 'Identity & Manufacturer' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'date', label: 'Manufacture Date' },
  { key: 'contact', label: 'Consumer Care' },
  { key: 'other', label: 'Other Declarations' },
  { key: 'hazard', label: 'Hazard & Safety (EU CLP Advisory)' },
] as const;

const GROUP_ORDER = ['identity', 'quantity', 'pricing', 'date', 'contact', 'other', 'hazard'];
export { GROUP_ORDER };

// ═══════════════════════════════════════════════════════════════
// CONFIDENCE LEVELS
// ═══════════════════════════════════════════════════════════════

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  low: 0.6,
} as const;

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.low) return 'medium';
  return 'low';
}

export function needsReview(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.high;
}

export const CONFIDENCE_STYLES: Record<ConfidenceLevel, { label: string; bg: string; text: string; border: string; dot: string }> = {
  high: { label: 'High', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  medium: { label: 'Medium', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  low: { label: 'Low', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
};

// ═══════════════════════════════════════════════════════════════
// FIELD & PRODUCT STATUS
// ═══════════════════════════════════════════════════════════════

export type FieldStatus = 'extracted' | 'needs_review' | 'approved' | 'edited' | 'rejected';
export type ProductStatus = 'extracted' | 'needs_review' | 'compliant' | 'non_compliant' | 'completed';

// ═══════════════════════════════════════════════════════════════
// LLM EXTRACTION TYPES
// ═══════════════════════════════════════════════════════════════

export interface ExtractedField {
  field: string;
  value: string;
  confidence: number;
  source_page: number;
  source_snippet: string;
}

export interface ExtractionResponse {
  product_name: string;
  fields: ExtractedField[];
}

export interface MultiExtractionResponse {
  products: ExtractionResponse[];
}
