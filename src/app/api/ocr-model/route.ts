import { NextRequest, NextResponse } from 'next/server';

/**
 * Reports whether the fine-tuned OCR model (labelnet.traineddata) is deployed
 * at /tessdata/. Useful for a Settings/diagnostics UI and for verifying the
 * model actually made it into a deployment (Vercel/Netlify/Cloudflare Pages
 * all serve files from public/ statically).
 *
 * GET /api/ocr-model
 */
export async function GET(request: NextRequest) {
  try {
    // fetch() requires an absolute URL server-side — derive it from the request.
    const origin = request.nextUrl.origin;
    const modelUrl = `${origin}/tessdata/labelnet.traineddata`;

    const res = await fetch(modelUrl, { method: 'HEAD', cache: 'no-store' });

    // Some hosts/routes don't support HEAD — retry with a ranged GET.
    let deployed = res.ok;
    let contentType = res.headers.get('content-type') || '';
    if (!deployed) {
      const getRes = await fetch(modelUrl, {
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store',
      });
      deployed = getRes.status === 206 || getRes.status === 200;
      contentType = getRes.headers.get('content-type') || '';
    }

    // SPA-style 404 fallbacks serve HTML — that means the file is NOT there.
    if (contentType.includes('text/html')) deployed = false;

    return NextResponse.json({
      model: 'labelnet',
      deployed,
      url: '/tessdata/labelnet.traineddata',
      hint: deployed
        ? 'Fine-tuned model found — local OCR will use it.'
        : 'No custom model deployed. Add labelnet.traineddata to public/tessdata/ (see training/README.md).',
    });
  } catch (error) {
    return NextResponse.json(
      {
        model: 'labelnet',
        deployed: false,
        error: error instanceof Error ? error.message : 'Probe failed',
      },
      { status: 500 }
    );
  }
}
