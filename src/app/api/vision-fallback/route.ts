// ═══════════════════════════════════════════════════════════════
// Vision Fallback API — Server-side proxy for AI-enhanced OCR
// Routes requests to OpenRouter or NVIDIA with server-side API key
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { validateOutboundApiUrl } from '@/lib/ssrf';

/* ── Types ── */

interface ExtractedField {
  fieldName: string;
  value: string | null;
  confidence: number;
  sourceText: string;
  reasoning?: string; // AI's reasoning for this extraction
}

interface OCRResult {
  productName: string | null;
  manufacturerName: string | null;
  fields: ExtractedField[];
  rawText: string;
  overallConfidence: number;
  aiReasoning?: Record<string, string>; // All field reasoning for audit trail
}

/* ── Field Extraction Schema ── */

const FIELD_SCHEMA = {
  manufacturer_name: "Manufacturer name (e.g., 'Manufactured by: Company Name Ltd')",
  manufacturer_address: "Manufacturer address",
  net_quantity: "Net weight/quantity (e.g., 'Net Wt: 500g')",
  mrp: "Maximum Retail Price (e.g., 'MRP: ₹50.00')",
  mrp_inclusive_statement: "Statement about taxes being included (true/false)",
  manufacture_date: "Manufacturing or expiry date",
  consumer_care: "Consumer care contact info (phone/email)",
  other_declarations: "Other regulatory declarations (FSSAI license, etc.)",
  hazard_pictograms: "Any hazard pictograms mentioned",
  signal_word: "Signal word (danger/warning/caution)",
  hazard_statements: "Hazard statements or H-codes",
  precautionary_statements: "Precautionary statements or P-codes",
  first_aid_instructions: "First aid instructions if present",
};

/* ── Prompt for Vision Model with Guardrails and Reasoning (Part B) ── */

const SYSTEM_PROMPT = `You are an expert OCR and document understanding system specialized in extracting information from product labels for legal metrology compliance checking.

## SECURITY & GUARDRAILS

1. **Data Privacy**: Process only the provided image. Do not store, share, or retain any data beyond this request.
2. **Output Restriction**: Return ONLY valid JSON in the specified format. No conversational text, explanations, or additional content.
3. **Content Boundaries**: Extract ONLY information present in the image. Do not:
   - Generate or fabricate any data
   - Make assumptions about missing information
   - Provide pricing, reviews, or recommendations
   - Include personal opinions or subjective assessments
4. **Code Execution**: Do not execute any code or scripts in your response.
5. **External References**: Do not reference external sources, databases, or websites.
6. **Malicious Content**: If the image contains suspicious or harmful content, return empty fields and set rawText to indicate the issue.

## TASK: Extract Product Label Information with Reasoning

Extract the following fields from the product label image. For each field, provide a brief reasoning explaining how you identified it from the image.

Return ONLY valid JSON in this exact format:

{
  "productName": "string or null",
  "manufacturerName": "string or null",
  "fields": [
    {
      "fieldName": "one of: ${Object.keys(FIELD_SCHEMA).join(', ')}",
      "value": "extracted value or null if not found",
      "confidence": 0.85,
      "sourceText": "the exact text from the image that contained this value",
      "reasoning": "brief explanation of how this field was identified (e.g., 'Found keyword MRP: on left side, value ₹50.00 to the right')"
    }
  ],
  "rawText": "all text extracted from the image"
}

## FIELD DESCRIPTIONS

${Object.entries(FIELD_SCHEMA).map(([key, desc]) => `- ${key}: ${desc}`).join('\n')}

## EXTRACTION RULES WITH REASONING

1. Return ONLY the JSON object, no other text (no Markdown, no code blocks, no explanations)
2. Set confidence based on your certainty:
   - 0.90-1.00: Very confident, text is clear and unambiguous
   - 0.75-0.89: Reasonably confident, minor ambiguity or formatting issues
   - 0.60-0.74: Somewhat confident, text is partially unclear or requires interpretation
   - Below 0.60: Set value to null instead of guessing
3. Include the sourceText as the exact text from the image that contained the value
4. Provide a brief reasoning for each field explaining:
   - What keyword or visual cue led you to this field
   - Where the value is located relative to the keyword (same line, below, etc.)
   - Any formatting considerations (e.g., "MRP: ₹50.00" - value after colon)
5. Set value to null if a field is not found in the image (do not guess or fabricate)
6. productName: The main product name, usually the first prominent text at the top
7. manufacturerName: The company that manufactured the product - look for "Manufactured by", "Mfg.", "Mfr.", etc.
8. For numeric values, include units (e.g., "500g", "₹50.00")
9. For dates, preserve the format as shown in the image
10. Be conservative - if you're not confident about a field, set it to null rather than guessing

## HIGH-SEVERITY FIELDS (PRIORITY ATTENTION)

Pay special attention to these Legal Metrology mandatory fields:
- **manufacturer_name**: Look for keywords like "Mfg.", "Manufactured by", "Manufacturer", "From"
- **manufacturer_address**: Usually near manufacturer name or in a separate "Address" section
- **manufacture_date**: Look for "Mfg", "Mfg.", "Manufacture", "Pack", "DOM", "Best Before", "Exp"
- **mrp**: Look for "MRP", "Maximum Retail Price", "M.R.P.", price symbol ₹, "Rs."

For these high-severity fields, if the keyword is present but the value is unclear, set confidence lower (0.60-0.74) and explain the difficulty in reasoning. DO NOT guess values without visual evidence.

## OUTPUT GUARDRAILS

- The response must be a single, valid JSON object
- Do not include any conversational filler like "Here is the extracted information:"
- Do not use Markdown code blocks (\`\`\`json)
- Do not add comments or explanations within the JSON
- If extraction fails completely, return: {"productName": null, "manufacturerName": null, "fields": [], "rawText": ""}
- Every field in the "fields" array must include a "reasoning" field
`;

/* ── Helpers: Normalize and extract JSON from AI responses ── */

/**
 * Map free-form field names that vision models actually emit ("Manufacturer
 * Name", "MRP", "Net Weight", "Mfg Date"...) onto the app's schema field
 * names. Small models ignore the field enum in the prompt, so without this
 * mapping their fields are silently dropped and AI mode "extracts nothing".
 */
const FIELD_SYNONYMS: Record<string, string> = {
  // productName/brand belong in the top-level productName field — dropped here.
  'manufacturer': 'manufacturer_name',
  'manufacturername': 'manufacturer_name',
  'manufacturer_name': 'manufacturer_name',
  'mfgby': 'manufacturer_name',
  'mfdby': 'manufacturer_name',
  'manufacturedby': 'manufacturer_name',
  'packer': 'manufacturer_name',
  'address': 'manufacturer_address',
  'manufactureraddress': 'manufacturer_address',
  'manufacturer_address': 'manufacturer_address',
  'mfgaddress': 'manufacturer_address',
  'netweight': 'net_quantity',
  'netwt': 'net_quantity',
  'netquantity': 'net_quantity',
  'net_quantity': 'net_quantity',
  'netqty': 'net_quantity',
  'quantity': 'net_quantity',
  'weight': 'net_quantity',
  'mrp': 'mrp',
  'price': 'mrp',
  'maximumretailprice': 'mrp',
  'mfgdate': 'manufacture_date',
  'mfg_date': 'manufacture_date',
  'manufacturedate': 'manufacture_date',
  'manufacture_date': 'manufacture_date',
  'manufacturingdate': 'manufacture_date',
  'packdate': 'manufacture_date',
  'packedon': 'manufacture_date',
  'dateofmanufacture': 'manufacture_date',
  'consumercare': 'consumer_care',
  'consumer_care': 'consumer_care',
  'customercare': 'consumer_care',
  'contact': 'consumer_care',
  'contactinfo': 'consumer_care',
  'email': 'consumer_care',
  'phone': 'consumer_care',
  'helpline': 'consumer_care',
  'fssai': 'other_declarations',
  'fssailicense': 'other_declarations',
  'license': 'other_declarations',
  'licenseno': 'other_declarations',
  'batchnumber': 'other_declarations',
  'batch': 'other_declarations',
  'lot': 'other_declarations',
  'countryoforigin': 'other_declarations',
  'origin': 'other_declarations',
  'importedby': 'other_declarations',
  'marketedby': 'other_declarations',
  'signalword': 'signal_word',
  'signal_word': 'signal_word',
  'hazard': 'hazard_statements',
  'hazardstatement': 'hazard_statements',
  'hazard_statements': 'hazard_statements',
  'hazards': 'hazard_statements',
  'hazardpictograms': 'hazard_pictograms',
  'hazard_pictograms': 'hazard_pictograms',
  'pictograms': 'hazard_pictograms',
  'precautionarystatement': 'precautionary_statements',
  'precautionary_statements': 'precautionary_statements',
  'firstaid': 'first_aid_instructions',
  'firstaidinstructions': 'first_aid_instructions',
  'first_aid_instructions': 'first_aid_instructions',
  'mrpinclusivestatement': 'mrp_inclusive_statement',
  'mrp_inclusive_statement': 'mrp_inclusive_statement',
  'taxesincluded': 'mrp_inclusive_statement',
};

/**
 * Normalize an arbitrary model-emitted field name to a schema field name,
 * or null when it cannot be mapped (non-compliance chatter like "Serving
 * Size" that would break the compliance engine).
 */
function normalizeFieldName(rawName: unknown): string | null {
  if (typeof rawName !== 'string') return null;
  const key = rawName.toLowerCase().replace(/[\s.\-_]+/g, '');
  if (Object.prototype.hasOwnProperty.call(FIELD_SYNONYMS, key)) {
    return FIELD_SYNONYMS[key];
  }
  // Exact schema match (already normalized once)
  if (Object.keys(FIELD_SCHEMA).includes(rawName)) return rawName;
  return null;
}

function getTextContent(content: unknown): string | null {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const text = content
      .map(part => {
        if (typeof part === 'string') return part;
        if (isRecord(part) && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('')
      .trim();
    return text || null;
  }

  return null;
}

function extractJSON(response: string): unknown {
  const trimmed = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Providers sometimes add prose around the JSON. Continue with a balanced scan.
  }

  for (let start = 0; start < trimmed.length; start += 1) {
    if (trimmed[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < trimmed.length; index += 1) {
      const character = trimmed[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, index + 1)) as unknown;
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/* ── Helper: Validate OCR Result with Reasoning Support ── */

/**
 * Models often return confidence as a string ("0.85"), a 0-100 number (85),
 * or omit it entirely. Coerce all of these instead of dropping the field.
 */
function coerceConfidence(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Treat 0-100 scale as 0-1 (some models report percentage confidence)
    return raw > 1 ? Math.min(raw / 100, 1) : Math.max(raw, 0);
  }
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return parsed > 1 ? Math.min(parsed / 100, 1) : Math.max(parsed, 0);
    }
  }
  return 0.8; // Model found the value but omitted confidence — keep it
}

/**
 * Lenient field validation: a field is usable if it has a known fieldName and
 * a non-null value. Models frequently omit sourceText/reasoning or wrap
 * confidence in a string — those cases previously caused fields to be
 * silently DROPPED (the "AI mode fills no fields" bug).
 */
function coerceField(raw: unknown): ExtractedField | null {
  if (!isRecord(raw)) return null;
  // Accept the many free-form names models emit ("Manufacturer Name", "MRP",
  // "Net Weight"...) and map them onto schema names; unmappable names are
  // dropped instead of polluting the compliance engine.
  const fieldName = normalizeFieldName(raw.fieldName);
  if (!fieldName) return null;

  let value: string | null = null;
  if (typeof raw.value === 'string') {
    const trimmed = raw.value.trim();
    if (trimmed.length > 0) value = trimmed;
  } else if (typeof raw.value === 'number' || typeof raw.value === 'boolean') {
    value = String(raw.value);
  }

  return {
    fieldName,
    value,
    confidence: coerceConfidence(raw.confidence),
    sourceText: typeof raw.sourceText === 'string' ? raw.sourceText : String(value ?? ''),
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : undefined,
  };
}

function validateOCRResult(data: unknown): OCRResult | null {
  if (!isRecord(data)) return null;

  // Check required fields (top-level: tolerate missing/mistyped rawText —
  // the fields are what matter for compliance checking)
  if (data.productName !== null && typeof data.productName !== 'string') {
    data.productName = typeof data.productName === 'undefined' ? null : String(data.productName);
  }
  if (data.manufacturerName !== null && typeof data.manufacturerName !== 'string') {
    data.manufacturerName = typeof data.manufacturerName === 'undefined' ? null : String(data.manufacturerName);
  }
  if (!Array.isArray(data.fields)) return null;
  if (typeof data.rawText !== 'string') {
    // Recover: assemble rawText from field source texts instead of rejecting
    data.rawText = (data.fields as unknown[])
      .map((f) => (isRecord(f) && typeof f.sourceText === 'string' ? f.sourceText : ''))
      .filter(Boolean)
      .join('\n');
  }

  // Coerce each field leniently; keep null-valued fields (they record that
  // the model looked and did not find the declaration)
  const validFields = (data.fields as unknown[])
    .map(coerceField)
    .filter((f): f is ExtractedField => f !== null);

  // Collect reasoning for audit trail (server-side logging)
  const aiReasoning: Record<string, string> = {};
  for (const rawField of data.fields) {
    if (isRecord(rawField) && typeof rawField.fieldName === 'string' && typeof rawField.reasoning === 'string') {
      aiReasoning[rawField.fieldName] = rawField.reasoning;
    }
  }

  // Log high-severity field reasoning for debugging
  const highSeverityFields = ['manufacturer_name', 'manufacturer_address', 'manufacture_date', 'mrp'];
  const highSeverityReasoning = highSeverityFields
    .filter(f => aiReasoning[f])
    .map(f => `[${f}]: ${aiReasoning[f]}`)
    .join('\n  ');

  if (highSeverityReasoning) {
    console.log(`[Cloud OCR AI Reasoning]\n  ${highSeverityReasoning}`);
  }

  // Calculate overall confidence (average over fields that actually found a value)
  const foundFields = validFields.filter((f) => f.value !== null);
  const overallConfidence = foundFields.length > 0
    ? foundFields.reduce((sum: number, f: ExtractedField) => sum + f.confidence, 0) / foundFields.length
    : 0.85; // Default confidence for cloud path

  return {
    productName: (data.productName as string | null) ?? null,
    manufacturerName: (data.manufacturerName as string | null) ?? null,
    fields: validFields,
    rawText: data.rawText as string,
    overallConfidence,
    aiReasoning: Object.keys(aiReasoning).length > 0 ? aiReasoning : undefined,
  };
}

/* ── Main POST Handler ── */

/* ── Serverless execution limit ──
 *
 * Vision-model scans routinely need 30-120s (the 90B model up to ~4 min).
 * Since Vercel's Fluid compute became the default, the Hobby plan allows
 * 300s per function (previously 10-60s, which caused
 * FUNCTION_INVOCATION_TIMEOUT kills mid-scan). Declaring 300 gives slow
 * models room; the internal axios timeout below is the effective limit.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { image, provider, category = 'openrouter' } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid image data' },
        { status: 400 }
      );
    }

    if (!provider || typeof provider !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid provider configuration' },
        { status: 400 }
      );
    }

    const { apiUrl, model, apiKey } = provider;

    if (!apiUrl || !model || !apiKey) {
      return NextResponse.json(
        { error: 'Incomplete provider configuration' },
        { status: 400 }
      );
    }

    // SSRF guard: never let the server post to an arbitrary client-supplied URL.
    const urlCheck = validateOutboundApiUrl(apiUrl);
    if (!urlCheck.allowed) {
      return NextResponse.json(
        { error: `Blocked: ${urlCheck.reason}` },
        { status: 400 }
      );
    }

    // Prepare the common request payload
    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all the information you can from this product label image.',
            },
            {
              type: 'image_url',
              image_url: {
                url: image, // Base64 image data
              },
            },
          ],
        },
      ],
      max_tokens: 6000,
      temperature: 0.1, // Low temperature for consistent extraction
      // Forces OpenAI-compatible providers (NVIDIA NIM, OpenRouter) to emit a
      // single valid JSON object. Verified live on NVIDIA
      // meta/llama-3.2-11b-vision-instruct: WITHOUT this the model returns
      // prose and the JSON parse step fails (the historic "AI mode broken" bug).
      response_format: { type: 'json_object' },
    };

    let aiMessage: string;
    let providerName: string;

    // Route to appropriate API based on category
    if (category === 'nvidia') {
      // Use NVIDIA API with axios
      try {
        const headers = {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        };

        const response = await axios.post(apiUrl, payload, {
          headers,
          // Vision models on NVIDIA regularly take 30-60s (11B measured 28-48s
          // for one label). 30s aborted real work mid-flight; 120s covers the
          // slowest vision model while still bounded.
          timeout: 200000,
        });

        providerName = model;
        aiMessage = getTextContent(response.data?.choices?.[0]?.message?.content) || '';

        if (!aiMessage) {
          console.error('No content in NVIDIA response:', response.data);
          return NextResponse.json(
            { error: 'No content received from NVIDIA AI service' },
            { status: 500 }
          );
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error('NVIDIA API error:', error.response?.data);

          if (error.response?.status === 401) {
            return NextResponse.json(
              { error: 'Invalid NVIDIA API key. Please check your API key in AI Providers settings.' },
              { status: 401 }
            );
          } else if (error.response?.status === 429) {
            return NextResponse.json(
              { error: 'NVIDIA rate limit exceeded. Please try again later.' },
              { status: 429 }
            );
          } else if (error.response?.status === 402) {
            return NextResponse.json(
              { error: 'Insufficient NVIDIA credits. Please add credits to your account.' },
              { status: 402 }
            );
          } else if (error.response?.status === 404) {
            return NextResponse.json(
              { error: 'NVIDIA model not found. Please check the model ID in AI Providers settings.' },
              { status: 404 }
            );
          } else if (error.response?.status === 403) {
            return NextResponse.json(
              { error: 'NVIDIA rejected this request (403 Authorization failed). Check that the API key is active and has access to this model.' },
              { status: 403 }
            );
          }

          const errorMessage = error.response?.data?.error || error.message;
          return NextResponse.json(
            { error: `NVIDIA API error: ${error.response?.status || 'Network'} - ${errorMessage}` },
            { status: error.response?.status || 500 }
          );
        }

        console.error('NVIDIA request error:', error);
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to connect to NVIDIA API' },
          { status: 500 }
        );
      }
    } else {
      // Use OpenRouter API with fetch (default)
      const openRouterRequest = {
        ...payload,
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'LMCC - Legal Metrology Compliance Checker',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openRouterRequest),
      });

      providerName = model;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('OpenRouter API error:', errorText);

        // Handle specific error types with detailed messages
        if (response.status === 401) {
          return NextResponse.json(
            { error: 'Invalid OpenRouter API key. Please check your API key in AI Providers settings.' },
            { status: 401 }
          );
        } else if (response.status === 429) {
          return NextResponse.json(
            { error: 'OpenRouter rate limit exceeded. Please try again later or upgrade your plan.' },
            { status: 429 }
          );
        } else if (response.status === 402) {
          return NextResponse.json(
            { error: 'Insufficient OpenRouter credits. Please add credits to your account.' },
            { status: 402 }
          );
        } else if (response.status === 400) {
          return NextResponse.json(
            { error: 'Bad request. Please check the model configuration.' },
            { status: 400 }
          );
        } else if (response.status === 404) {
          return NextResponse.json(
            { error: 'OpenRouter model not found. Please check the model ID in AI Providers settings.' },
            { status: 404 }
          );
        } else if (response.status === 403) {
          return NextResponse.json(
            { error: 'OpenRouter rejected this request (403 Authorization failed). Check that the API key is active and has access to this model.' },
            { status: 403 }
          );
        }

        return NextResponse.json(
          { error: `OpenRouter API error: ${response.status} ${response.statusText}. ${errorText}` },
          { status: response.status }
        );
      }

      const data = await response.json();

      // Extract the AI's response
      aiMessage = getTextContent(data.choices?.[0]?.message?.content) || '';
      if (!aiMessage) {
        console.error('No content in OpenRouter response:', data);
        return NextResponse.json(
          { error: 'No content received from OpenRouter AI service' },
          { status: 500 }
        );
      }
    }

    // Parse and validate the JSON response. Even with
    // response_format: json_object, small vision models sometimes return prose
    // (e.g. Llama 3.2 11B ignores response_format in some modes). If the
    // message is not parseable as JSON, salvage a rawText-style result from
    // the prose instead of failing the whole scan — AI mode previously
    // hard-failed here with "Failed to parse AI response as JSON".
    let parsed = extractJSON(aiMessage);
    let proseFallbackUsed = false;
    if (!parsed) {
      // Second chance: re-ask the SAME model to convert its own prose into
      // the required JSON. Small vision models (Llama 3.2 11B) sometimes
      // ignore response_format/json instructions entirely; a cheap text-only
      // follow-up reliably converts the prose. Verified live: this recovers
      // full field data from an otherwise-useless prose response.
      console.warn('[Cloud OCR] Non-JSON prose received — attempting one conversion pass. Preview:', aiMessage.slice(0, 150));
      try {
        const convPayload = {
          model,
          messages: [
            {
              role: 'system',
              content:
                'Convert the following OCR analysis of a product label into ONLY a JSON object with keys: '
                + 'productName (string or null), manufacturerName (string or null), fields (array of '
                + '{fieldName, value, confidence (0-1), sourceText}), rawText. Use these fieldName values when they apply: '
                + `${Object.keys(FIELD_SCHEMA).join(', ')}. Use null for values not mentioned. Output ONLY the JSON object.`,
            },
            { role: 'user', content: aiMessage.slice(0, 6000) },
          ],
          max_tokens: 4000,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        };

        let convMessage: string | null = null;
        if (category === 'nvidia') {
          const convRes = await axios.post(
            apiUrl,
            convPayload,
            { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 90000 }
          );
          convMessage = getTextContent(convRes.data?.choices?.[0]?.message?.content);
        } else {
          const convRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
              'X-Title': 'LMCC - Legal Metrology Compliance Checker',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(convPayload),
          });
          if (convRes.ok) {
            const convData = await convRes.json();
            convMessage = getTextContent(convData.choices?.[0]?.message?.content);
          }
        }

        const converted = convMessage ? extractJSON(convMessage) : null;
        if (converted) {
          parsed = converted;
          proseFallbackUsed = true;
          console.log('[Cloud OCR] Prose→JSON conversion succeeded.');
        }
      } catch (convError) {
        console.warn('[Cloud OCR] Conversion pass failed:', convError instanceof Error ? convError.message : convError);
      }

      // Final fallback: keep the prose as rawText so the scan still records
      // what the model saw instead of hard-failing.
      if (!parsed) {
        parsed = {
          productName: null,
          manufacturerName: null,
          fields: [],
          rawText: aiMessage,
        };
        proseFallbackUsed = true;
      }
    }

    const validated = validateOCRResult(parsed);
    if (!validated) {
      console.error('Invalid OCR result structure:', parsed);
      return NextResponse.json(
        { error: 'Invalid OCR result structure from AI service' },
        { status: 500 }
      );
    }

    // Log which path was used (server-side logging)
    const reasoningCount = Object.keys(validated.aiReasoning || {}).length;
    console.log(`[Cloud OCR] Used provider: ${providerName} (${category}), extracted ${validated.fields.length} fields, ${reasoningCount} with reasoning${proseFallbackUsed ? ' [prose fallback — rawText only]' : ''}`);

    // Add extraction method to response
    const response = {
      ...validated,
      extractionMethod: 'cloud_ai' as const,
    };

    // Return the validated OCR result
    return NextResponse.json(response);

  } catch (error) {
    console.error('Vision fallback error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/* ── OPTIONS Handler (for CORS) ── */

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
