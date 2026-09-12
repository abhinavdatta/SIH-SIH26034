// ═══════════════════════════════════════════════════════════════
// Legal Metrology (Packaged Commodities) Rules, 2011
// Offline Reference Data for SIH26034 LMCC
// ═══════════════════════════════════════════════════════════════

export interface LegalRule {
  ruleRef: string;
  title: string;
  description: string;
  mandatory: boolean;
  penaltyRef?: string;
}

export interface MandatoryField {
  fieldKey: string;
  label: string;
  ruleRef: string;
  description: string;
  format: string;
  examples: string[];
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export const LEGAL_ACT_TITLE =
  'The Legal Metrology Act, 2009 (Act No. 1 of 2010)';

export const RULES_TITLE =
  'The Legal Metrology (Packaged Commodities) Rules, 2011';

export const NOTIFICATION_DATE = 'October 28, 2011';

export const AMENDMENT_HISTORY = [
  {
    year: 2012,
    description: 'First Amendment — expanded e-commerce labelling requirements',
  },
  {
    year: 2017,
    description:
      'Second Amendment — introduced QR code option for supplementary info',
  },
  {
    year: 2020,
    description:
      'Third Amendment — updated penalty structure and composite packaging rules',
  },
  {
    year: 2023,
    description:
      'Fourth Amendment — added online marketplace seller declaration requirements',
  },
];

/**
 * The 8 mandatory declarations under Rule 6(1)
 * that every pre-packaged commodity must display.
 */
export const MANDATORY_FIELDS: MandatoryField[] = [
  {
    fieldKey: 'manufacturer_name',
    label: 'Manufacturer Name',
    ruleRef: 'Rule 6(1)(a)',
    description:
      'The name and address of the manufacturer, packer, or importer of the pre-packaged commodity. For imported goods, the country of origin must also be declared.',
    format: 'Full legal name of the manufacturer/company',
    examples: ['GCMMF Ltd.', 'Parle Products Pvt. Ltd.', 'Nestlé India Ltd.'],
    severity: 'HIGH',
  },
  {
    fieldKey: 'manufacturer_address',
    label: 'Manufacturer Address',
    ruleRef: 'Rule 6(1)(a)',
    description:
      'Complete address of the manufacturing unit or registered office including city, state, and PIN code. Must be sufficient to locate the premises.',
    format: 'Full address with city, state, PIN code',
    examples: [
      'GCMMF, Anand, Gujarat 388001',
      'Nestlé House, Gurgaon, Haryana 122002',
    ],
    severity: 'HIGH',
  },
  {
    fieldKey: 'net_quantity',
    label: 'Net Quantity',
    ruleRef: 'Rule 6(1)(b)',
    description:
      'The net quantity of the commodity in the package expressed in terms of the standard unit of weight or measure. Must be followed by the month and year of packing/import.',
    format: 'Number followed by standard metric unit (g, kg, ml, l)',
    examples: ['500 ml', '1 kg', '100g', '250 ml', '5 kg'],
    severity: 'HIGH',
  },
  {
    fieldKey: 'mrp',
    label: 'Maximum Retail Price (MRP)',
    ruleRef: 'Rule 6(1)(c)',
    description:
      'The maximum retail price (inclusive of all taxes) at which the commodity may be sold to the consumer. Must be displayed prominently.',
    format: 'Currency symbol (₹ or Rs.) followed by amount',
    examples: ['₹26.00', 'Rs. 10', '₹199.00', 'INR 295'],
    severity: 'HIGH',
  },
  {
    fieldKey: 'mrp_inclusive_statement',
    label: 'MRP Inclusive-of-Taxes Statement',
    ruleRef: 'Rule 6(1)(c)',
    description:
      'A clear declaration that the MRP is inclusive of all taxes. This prevents dual taxation complaints and ensures consumer transparency.',
    format:
      'Text containing "inclusive" and "tax"/"taxes"',
    examples: [
      'Inclusive of all taxes',
      'MRP inclusive of all taxes',
      'MRP is inclusive of all taxes',
    ],
    severity: 'MEDIUM',
  },
  {
    fieldKey: 'manufacture_date',
    label: 'Month & Year of Manufacture',
    ruleRef: 'Rule 6(1)(d)',
    description:
      'The month and year in which the commodity was manufactured, packed, or imported. For best-before goods, the best-before date must also be displayed.',
    format:
      'MM/YYYY or month-name YYYY or "MFG MM/YYYY"',
    examples: [
      'MFG 06/2024',
      'Best Before Jan 2025',
      '12/2024',
      'MFG Oct 2024',
    ],
    severity: 'HIGH',
  },
  {
    fieldKey: 'consumer_care',
    label: 'Consumer Care Details',
    ruleRef: 'Rule 6(1)(e)',
    description:
      'Contact details (phone, email, or address) for consumer complaints and queries. The manufacturer or packer must provide a mechanism for consumer grievance redressal.',
    format:
      'Phone number, email, or toll-free number',
    examples: [
      '1800-258-3333, customercare@amul.com',
      '1800-221-8808',
      'care@tataconsumer.com',
    ],
    severity: 'MEDIUM',
  },
  {
    fieldKey: 'other_declarations',
    label: 'Other Prescribed Declarations',
    ruleRef: 'Rule 6(1)(f)',
    description:
      'Any additional mandatory declarations as specified under the Rules or relevant Food Safety and Standards Authority of India (FSSAI) requirements. Includes FSSAI license number, ingredients, nutritional info, veg/non-veg indicator.',
    format:
      'Variable — FSSAI license, ingredients, nutritional info, etc.',
    examples: [
      'FSSAI Lic No. 10012021001234',
      'Contains wheat, milk solids, edible vegetable oil',
      'Iodised Salt, FSSAI 10012021004567',
    ],
    severity: 'LOW',
  },
];

/**
 * Key sections of the Legal Metrology (Packaged Commodities) Rules, 2011
 * for quick offline reference.
 */
export const LEGAL_RULES: LegalRule[] = [
  {
    ruleRef: 'Rule 2(k)',
    title: 'Definition of Pre-Packaged Commodity',
    description:
      '"Pre-packaged commodity" means a commodity which, without the purchaser being present, is placed in a package of whatever nature, whether sealed or not, so that the product contained therein has a pre-determined quantity.',
    mandatory: false,
  },
  {
    ruleRef: 'Rule 4',
    title: 'Units of Measurement',
    description:
      'All quantities must be expressed in metric units as specified in the Schedule II of the General Rules, 2011. Non-metric units may only be used as supplementary declarations.',
    mandatory: true,
  },
  {
    ruleRef: 'Rule 5',
    title: 'Quantity Variations',
    description:
      'The net quantity in a package shall not be less than the quantity declared on the label. Permissible error limits are defined based on the declared quantity (e.g., ±1.5% for quantities between 50g–500g).',
    mandatory: true,
  },
  {
    ruleRef: 'Rule 6(1)(a)',
    title: 'Name and Address of Manufacturer/Packer',
    description:
      'Every pre-packaged commodity shall bear the name, address, telephone number, email address (if available) of the manufacturer, packer, or importer. For imported goods, the name of the country of origin must also be declared.',
    mandatory: true,
    penaltyRef: 'Section 36 of the Act — fine up to ₹25,000',
  },
  {
    ruleRef: 'Rule 6(1)(b)',
    title: 'Net Quantity Declaration',
    description:
      'The net quantity of the commodity in the package must be declared. For quantities up to 1000g or 1000ml, the quantity must be expressed in grams or millilitres. Above 1000, kilograms or litres must be used.',
    mandatory: true,
    penaltyRef: 'Section 36 — fine up to ₹25,000 for first offence',
  },
  {
    ruleRef: 'Rule 6(1)(c)',
    title: 'Maximum Retail Price (MRP)',
    description:
      'Every package shall bear the MRP inclusive of all taxes. The selling price shall not exceed the MRP. The MRP must be displayed in a clear and conspicuous manner. Consumer goods must also declare that MRP is inclusive of all taxes.',
    mandatory: true,
    penaltyRef:
      'Section 36 — imprisonment up to 1 year and/or fine up to ₹25,000',
  },
  {
    ruleRef: 'Rule 6(1)(d)',
    title: 'Date of Manufacture/Packing',
    description:
      'The month and year in which the commodity was manufactured or packed must be declared. For commodities with a shelf life, the best-before/use-by date must also be displayed.',
    mandatory: true,
  },
  {
    ruleRef: 'Rule 6(1)(e)',
    title: 'Consumer Care Information',
    description:
      'Contact details for consumer complaints must be provided. This includes telephone number, email address, or customer care address. For e-commerce, the seller\'s contact details must also be available.',
    mandatory: true,
  },
  {
    ruleRef: 'Rule 6(1)(f)',
    title: 'Other Mandatory Declarations',
    description:
      'Additional declarations as may be specified by the Central Government, including but not limited to: FSSAI license number, ingredients list, nutritional information, veg/non-veg symbol, allergen declaration, and batch/lot number.',
    mandatory: true,
  },
  {
    ruleRef: 'Rule 7',
    title: 'Lettering and Numerals Size',
    description:
      'The letters and numerals used for mandatory declarations shall be legible, prominent, and of a size not less than 1mm height per 100mm of the largest side of the package. Minimum 0.8mm for packages where the largest side is less than 100mm.',
    mandatory: true,
  },
  {
    ruleRef: 'Rule 9',
    title: 'Declaration for E-commerce Packages',
    description:
      'For e-commerce sales, the seller must display: (i) name and address of the seller, (ii) common or generic name, (iii) net quantity, (iv) MRP, (v) date of manufacture/import, (vi) best-before date (if applicable).',
    mandatory: true,
  },
  {
    ruleRef: 'Rule 18',
    title: 'Penalty for Contravention',
    description:
      'Any manufacturer, packer, or importer who contravenes the provisions of these Rules shall be punishable with fine which may extend to ₹25,000 for the first offence and ₹50,000 for subsequent offences. In case of non-compliance affecting consumer safety, imprisonment may also apply.',
    mandatory: false,
  },
  {
    ruleRef: 'Section 36',
    title: 'Penalties Under the Act',
    description:
      'Whoever uses any weight or measure which does not conform to the standards established, or sells any commodity in non-standard quantities, shall be punishable with fine up to ₹25,000 and for subsequent offences with imprisonment up to one year or fine up to ₹50,000, or both.',
    mandatory: false,
  },
];

/**
 * Quick-reference penalty table for enforcement officials.
 */
export const PENALTY_TABLE = [
  {
    offence: 'Missing or incorrect MRP',
    firstOffence: 'Fine up to ₹25,000',
    subsequentOffence: 'Fine up to ₹50,000',
    ruleRef: 'Section 36 + Rule 6(1)(c)',
  },
  {
    offence: 'Selling above MRP',
    firstOffence:
      'Imprisonment up to 1 year and/or fine up to ₹25,000',
    subsequentOffence:
      'Imprisonment up to 3 years and/or fine up to ₹50,000',
    ruleRef: 'Section 36(1)(ii)',
  },
  {
    offence: 'Missing net quantity declaration',
    firstOffence: 'Fine up to ₹25,000',
    subsequentOffence: 'Fine up to ₹50,000',
    ruleRef: 'Section 36 + Rule 6(1)(b)',
  },
  {
    offence: 'Missing manufacturer details',
    firstOffence: 'Fine up to ₹25,000',
    subsequentOffence: 'Fine up to ₹50,000',
    ruleRef: 'Section 36 + Rule 6(1)(a)',
  },
  {
    offence: 'Missing date of manufacture',
    firstOffence: 'Fine up to ₹25,000',
    subsequentOffence: 'Fine up to ₹50,000',
    ruleRef: 'Section 36 + Rule 6(1)(d)',
  },
  {
    offence: 'Short measure/weight',
    firstOffence: 'Fine up to ₹25,000',
    subsequentOffence:
      'Imprisonment up to 1 year and/or fine up to ₹50,000',
    ruleRef: 'Section 36(1)(i)',
  },
  {
    offence: 'Tampering with weight/measure',
    firstOffence:
      'Imprisonment up to 1 year and/or fine up to ₹10,000',
    subsequentOffence:
      'Imprisonment up to 2 years and/or fine up to ₹50,000',
    ruleRef: 'Section 35',
  },
];

/**
 * Compliance check categories with descriptions.
 */
export const COMPLIANCE_CHECKS = [
  {
    category: 'Identity',
    fields: ['manufacturer_name', 'manufacturer_address'],
    description:
      'Verifies the manufacturer\'s full legal name and complete registered address with city, state, and PIN code.',
  },
  {
    category: 'Quantity',
    fields: ['net_quantity'],
    description:
      'Checks that the net quantity is declared with proper metric units (g, kg, ml, l) and follows the format specified in Rule 6(1)(b).',
  },
  {
    category: 'Pricing',
    fields: ['mrp', 'mrp_inclusive_statement'],
    description:
      'Validates MRP format (₹/Rs. prefix), amount, and the mandatory inclusive-of-taxes statement.',
  },
  {
    category: 'Date',
    fields: ['manufacture_date'],
    description:
      'Checks the manufacture/packing date format for compliance with Rule 6(1)(d). Accepts MM/YYYY, month-name YYYY, and MFG prefixes.',
  },
  {
    category: 'Consumer Care',
    fields: ['consumer_care'],
    description:
      'Verifies that at least one valid consumer contact method (phone, email, toll-free) is present.',
  },
  {
    category: 'Other',
    fields: ['other_declarations'],
    description:
      'Checks for FSSAI license, ingredient lists, nutritional information, and other mandatory declarations.',
  },
];
