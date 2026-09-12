/* Diagnostic: replicate vision-fallback NVIDIA path byte-for-byte.
 * Usage: NVIDIA_KEY_1=nvapi-... NVIDIA_KEY_2=nvapi-... node scripts/diag-nvidia.cjs
 * (Temporary test keys removed from source after the 2026-09-11 debugging session.) */
const fs = require('fs');
const path = require('path');

const LLAMA_KEY = process.env.NVIDIA_KEY_1 || '';
const QWEN_KEY = process.env.NVIDIA_KEY_2 || '';
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

if (!LLAMA_KEY || !QWEN_KEY) {
  console.error('Set NVIDIA_KEY_1 and NVIDIA_KEY_2 env vars (any valid nvapi- key works).');
  process.exit(1);
}
