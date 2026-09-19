/* ═══════════════════════════════════════════════════════════════════════════
   Not Found — 404 page for unmatched URLs.
   Client component: a rickroll button, a tappable "404" that escalates,
   and a hint for the keyboard-curious. Dependency-free, renders instantly.
   Repo: github.com/abhinavdatta
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldAlert, Home, Shield, Music } from 'lucide-react';

const RICKROLL_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const ROLL_MESSAGES = [
  'This button definitely leads where you expected.',
  'You have clicked in good faith. The button appreciates you.',
  'Statistically, the page you want is behind this button.',
  'The button is now warm from usage.',
  'Okay, you deserve the truth: it was never going to work.',
];

export default function NotFound() {
  const [rolls, setRolls] = useState(0);
  const [discoTaps, setDiscoTaps] = useState(0);

  const discoHue = (discoTaps * 47) % 360;
  const rollMessage = ROLL_MESSAGES[Math.min(rolls, ROLL_MESSAGES.length - 1)];

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-page)',
        color: 'var(--text-primary)',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        padding: '1.5rem',
      }}
    >
      <main
        style={{
          maxWidth: '28rem',
          width: '100%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '2.5rem 2rem',
          textAlign: 'center',
        }}
      >
        <button
          type="button"
          aria-label="404"
          onClick={() => setDiscoTaps((t) => t + 1)}
          style={{
            width: '3.5rem',
            height: '3.5rem',
            borderRadius: 'var(--radius-md)',
            background: discoTaps > 0 ? `hsl(${discoHue} 70% 45%)` : 'var(--primary-light)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.25s ease',
            fontSize: '1.1rem',
            fontWeight: 800,
          }}
        >
          {discoTaps > 2 ? '🪩' : <ShieldAlert style={{ width: '1.5rem', height: '1.5rem' }} aria-hidden="true" />}
        </button>

        <p
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--primary)',
            margin: 0,
          }}
        >
          Error 404
        </p>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginTop: '0.25rem',
            color: 'var(--text-primary)',
          }}
        >
          Page not found
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '0.75rem' }}>
          The page you&apos;re looking for doesn&apos;t exist or may have moved. LMCC lives on a single
          dashboard — every tool is reachable from there.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: '0.8125rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Home style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
            Go to Dashboard
          </Link>
          <a
            href={RICKROLL_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setRolls((r) => Math.min(r + 1, ROLL_MESSAGES.length - 1))}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Music style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
            Take me to the missing page
          </a>
        </div>

        {rolls > 0 && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', fontStyle: 'italic' }}>
            {rollMessage}
          </p>
        )}

        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
          P.S. — if you got here by typing the old code ↑↑↓↓←→←→BA, wrong address.
        </p>

        <p
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            marginTop: '1.25rem',
          }}
        >
          <Shield style={{ width: '0.75rem', height: '0.75rem' }} aria-hidden="true" />
          SIH26034 LMCC — Legal Metrology Compliance Checker ·{' '}
          <a
            href="https://github.com/abhinavdatta"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary)' }}
          >
            github.com/abhinavdatta
          </a>
        </p>
      </main>
    </div>
  );
}
