/* Diagnostic 4: response_format json_object + prose fallback mining.
 * Usage: NVIDIA_KEY_1=nvapi-... node scripts/diag-nvidia4.cjs */
const fs = require('fs');
const path = require('path');

const LLAMA_KEY = process.env.NVIDIA_KEY_1 || '';

if (!LLAMA_KEY) {
  console.error('Set NVIDIA_KEY_1 env var.');
  process.exit(1);
}
