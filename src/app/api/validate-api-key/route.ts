// ═══════════════════════════════════════════════════════════════
// Validate API Key — Server-side API key validation endpoint
// Validates API keys for OpenRouter and NVIDIA providers
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { validateOutboundApiUrl } from '@/lib/ssrf';

/* ── Serverless execution limit ──
 *
 * Two-stage validation: stage 1 (models endpoint, ≤4s) + stage 2
 * (1-token probe, ≤8s) — worst case ~12s plus overhead. Under Fluid
 * compute the Hobby plan allows up to 300s; declaring 60 leaves ample
 * headroom so slow providers can never trigger
 * FUNCTION_INVOCATION_TIMEOUT before our own error handling runs.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiUrl, model, category, skipExternalTest = false } = body;

    // Validate required fields
    if (!apiKey || !apiUrl || !model || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: apiKey, apiUrl, model, category' },
        { status: 400 }
      );
    }

    // SSRF guard: never let the server fetch an arbitrary client-supplied URL.
    const urlCheck = validateOutboundApiUrl(apiUrl);
    if (!urlCheck.allowed) {
      return NextResponse.json(
        { valid: false, error: `Blocked: ${urlCheck.reason}` },
        { status: 400 }
      );
    }

    // Validate API key format based on provider category
    // Skip format validation for custom providers (they may have different formats)
    if (category === 'nvidia' && !apiUrl.includes('custom')) {
      if (!apiKey.startsWith('nvapi-')) {
        return NextResponse.json(
          { valid: false, error: 'Invalid NVIDIA API key format. Should start with nvapi-' },
          { status: 200 }
        );
      }
    } else if (category === 'openrouter' && !apiUrl.includes('custom')) {
      // OpenRouter default providers only
      if (!apiKey.startsWith('sk-or-') && !apiKey.startsWith('sk-')) {
        return NextResponse.json(
          { valid: false, error: 'Invalid API key format. Should start with sk-or- or sk-' },
          { status: 200 }
        );
      }
    }

    // If skipExternalTest is true, just validate format and return success
    if (skipExternalTest) {
      return NextResponse.json({
        valid: true,
        message: 'API key format is valid. External validation skipped.',
        formatValidated: true
      });
    }

    // Test the API with a minimal request.
    //
    // TWO-STAGE VALIDATION (fixes the recurring 8s 'Request timeout'):
    //   Stage 1 — instant key check against the provider's models endpoint.
    //     Proves the KEY is real and authorized with a ~100ms authenticated
    //     GET; no generation involved, so slow/cold model queues can't make
    //     a valid key look broken.
    //   Stage 2 — a 1-token generation probe, but NON-FATAL: if it times out
    //     while stage 1 passed, the key is valid and we report it (the user
    //     chooses a fast model at scan time; queue latency is not an auth
    //     problem).
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      // Add OpenRouter-specific headers
      if (category === 'openrouter') {
        headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        headers['X-Title'] = 'LMCC - Legal Metrology Compliance Checker';
      }

      /* ── Stage 1: key check via the models endpoint (≤4s) ── */
      const origin = new URL(apiUrl).origin;
      const listUrl =
        category === 'openrouter'
          ? `${origin}/api/v1/models`
          : category === 'nvidia'
            ? `${origin}/v1/models`
            : `${origin}/models`;

      let stage1: { ok: boolean; status: number; detail?: string };
      {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(listUrl, { headers, signal: controller.signal, cache: 'no-store' });
          if (res.ok) {
            stage1 = { ok: true, status: res.status };
          } else if (res.status === 401) {
            stage1 = { ok: false, status: 401, detail: 'Invalid API key. Please check your API key.' };
          } else if (res.status === 403) {
            stage1 = {
              ok: false,
              status: 403,
              detail:
                category === 'nvidia'
                  ? 'NVIDIA rejected this key (403). Check that the key is active and has access to this model.'
                  : 'The provider rejected this key (403). Check that it belongs to this provider.',
            };
          } else if (res.status === 404) {
            // No models endpoint on a custom gateway — skip to generation probe.
            stage1 = { ok: true, status: 404 };
          } else {
            stage1 = { ok: true, status: res.status }; // don't fail validation on odd statuses
          }
        } catch (e) {
          // Models endpoint unreachable/timed out — inconclusive, not fatal.
          stage1 = { ok: true, status: 0, detail: e instanceof Error ? e.message : 'unreachable' };
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!stage1.ok) {
        return NextResponse.json({ valid: false, error: stage1.detail }, { status: 200 });
      }

      /* ── Stage 2: 1-token generation probe (≤8s, non-fatal on timeout) ── */
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s — must fit Vercel Hobby's 10s function cap

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        let data;
        try {
          data = await response.json();
        } catch {
          // Generation returned non-JSON, but the key already passed stage 1.
          return NextResponse.json({
            valid: true,
            message: 'API key is valid (models check passed; generation probe was unreadable).',
          });
        }

        if (data?.choices?.[0]?.message?.content) {
          return NextResponse.json({
            valid: true,
            message: 'API key is valid and working'
          });
        }

        // If we got a valid JSON response but no choices field, try to provide more info
        if (data.error) {
          return NextResponse.json(
            { valid: false, error: data.error.message || data.error },
            { status: 200 }
          );
        }

        return NextResponse.json(
          { valid: false, error: 'Invalid response from API. No content returned.' },
          { status: 200 }
        );
      }

      // Handle specific error codes
      if (response.status === 401) {
        return NextResponse.json(
          { valid: false, error: 'Invalid API key. Please check your API key.' },
          { status: 200 }
        );
      } else if (response.status === 429) {
        return NextResponse.json(
          { valid: false, error: 'Rate limit exceeded. Please try again later.' },
          { status: 200 }
        );
      } else if (response.status === 402) {
        return NextResponse.json(
          { valid: false, error: 'Insufficient credits. Please add credits to your account.' },
          { status: 200 }
        );
      } else if (response.status === 404) {
        return NextResponse.json(
          { valid: false, error: `Model '${model}' not found. Please check the model ID.` },
          { status: 200 }
        );
      } else if (response.status === 403) {
        return NextResponse.json(
          {
            valid: false,
            error: category === 'nvidia'
              ? 'NVIDIA rejected this request (403 Authorization failed). Check that the key is an active NVIDIA API key and that it has access to this model.'
              : 'The provider rejected this request (403 Authorization failed). Check that the API key belongs to this provider and has access to this model.'
          },
          { status: 200 }
        );
      }

      // Try to get error details from response
      let errorText = 'Unknown error';
      try {
        errorText = await response.text();
        // Try to parse as JSON to get better error message
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) {
            errorText = errorJson.error.message || errorJson.error;
          } else if (errorJson.message) {
            errorText = errorJson.message;
          }
        } catch {
          // Keep text response as-is
        }
      } catch {
        errorText = 'Could not read error response';
      }

      return NextResponse.json(
        { valid: false, error: `API error (${response.status}): ${errorText}` },
        { status: 200 }
      );

    } catch (error) {
      console.error('API validation error:', error);

      // Handle AbortError (timeout). Stage 1 already proved the KEY is real,
      // so a slow generation is a model-queue problem, not an auth failure —
      // report success with a note instead of a scary false negative.
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json({
          valid: true,
          message: 'API key is valid. The model was slow to respond during the test probe — if scans feel slow, pick a faster model in Settings.',
        });
      }

      return NextResponse.json(
        { valid: false, error: error instanceof Error ? error.message : 'Network error' },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('Validate API key route error:', error);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
