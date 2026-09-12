/* ═══════════════════════════════════════════════════════════════════════════
   Not Found — 404 page for unmatched URLs.
   Static (server-rendered): the app is a single-route SPA, so any URL other
   than "/" ends up here. Kept dependency-free and animation-free so it
   renders instantly even on constrained devices.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ShieldAlert, Home, Shield } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
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
        <div
          style={{
            width: '3.5rem',
            height: '3.5rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <ShieldAlert style={{ width: '1.5rem', height: '1.5rem' }} aria-hidden="true" />
        </div>

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

        <a
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '1.5rem',
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
        </a>

        <p
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            marginTop: '1.75rem',
          }}
        >
          <Shield style={{ width: '0.75rem', height: '0.75rem' }} aria-hidden="true" />
          SIH26034 LMCC — Legal Metrology Compliance Checker
        </p>
      </main>
    </div>
  );
}
