/* Diagnostic 3: 90B + Kimi K3 JSON compliance.
 * Usage: NVIDIA_KEY_1=nvapi-... NVIDIA_KEY_2=nvapi-... node scripts/diag-nvidia3.cjs */
const fs = require('fs');
const path = require('path');

const LLAMA_KEY = process.env.NVIDIA_KEY_1 || '';
const QWEN_KEY = process.env.NVIDIA_KEY_2 || '';

if (!LLAMA_KEY || !QWEN_KEY) {
  console.error('Set NVIDIA_KEY_1 and NVIDIA_KEY_2 env vars.');
  process.exit(1);
}
