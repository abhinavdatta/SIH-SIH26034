// ═══════════════════════════════════════════════════════════════
// Validate API Key — Server-side API key validation endpoint
// Validates API keys for OpenRouter and NVIDIA providers
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { validateOutboundApiUrl } from '@/lib/ssrf';

/* ── Serverless execution limit ──
 *
 * This app deploys on the Vercel HOBBY plan, where serverless functions
 * are hard-capped at 10 seconds. Setting maxDuration = 10 makes the
 * limit explicit and lets local dev behave like production. The outbound
 * validation request below is deliberately cheap (max_tokens: 1, 8s
 * timeout) so it completes well inside the cap — a longer internal
 * timeout would be killed by Vercel's gateway (the historic 502 bug).
 */
export const maxDuration = 10;

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

    // Test the API with a minimal request
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
          return NextResponse.json(
            { valid: false, error: 'Invalid response format. API did not return valid JSON.' },
            { status: 200 }
          );
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

      // Handle AbortError (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { valid: false, error: 'Request timeout. The API server took too long to respond.' },
          { status: 200 }
        );
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