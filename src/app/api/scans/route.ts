// ═══════════════════════════════════════════════════════════════
// Scans API — /api/scans
// GET  → { authenticated, scans } (session-scoped)
// POST → { mode: 'push', scans } replaces the account's snapshot
//
// Scans are non-PII compliance records owned by the account; they are
// stored under the user id and never readable without a valid session
// cookie. Session cookie is httpOnly, so tokens never appear in JS.
//
// Repo: github.com/abhinavdatta
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import 'server-only';
import {
  getSessionByToken,
  saveUserScans,
  getUserScans,
  isDurableBackend,
} from '@/lib/server/auth-store';

const COOKIE_NAME = 'lmcc_session';

async function requireUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await getSessionByToken(token);
  return session?.userId ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ authenticated: false, scans: [] });

  const raw = await getUserScans(userId);
  let scans: unknown = [];
  if (raw) {
    try {
      scans = JSON.parse(raw);
    } catch {
      scans = [];
    }
  }
  return NextResponse.json({ authenticated: true, scans, persistent: isDurableBackend });
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { mode?: string; scans?: unknown };
  try {
    body = (await request.json()) as { mode?: string; scans?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (body.mode !== 'push' || !Array.isArray(body.scans)) {
    return NextResponse.json({ error: 'Expected { mode: "push", scans: [...] }' }, { status: 400 });
  }

  // Bound storage abuse: 2MB snapshot per account is generous for text scans.
  const serialized = JSON.stringify(body.scans);
  if (serialized.length > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Snapshot too large' }, { status: 413 });
  }

  await saveUserScans(userId, serialized);
  return NextResponse.json({ ok: true });
}
