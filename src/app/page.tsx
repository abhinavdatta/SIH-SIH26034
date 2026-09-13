/* ═══════════════════════════════════════════════════════════════════════════
   Page Entry — Single-route SPA, all client-side navigation via Zustand
   Seeds demo data on first load, gates on local auth, then renders AppShell.

   Author / repository: github.com/abhinavdatta
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import AppShell from '@/components/app/AppShell';
import DashboardView from '@/components/app/DashboardView';
import UploadScanView from '@/components/app/UploadScanView';
import ReviewQueueView from '@/components/app/ReviewQueueView';
import ComplianceReportView from '@/components/app/ComplianceReportView';
import ProductHistoryView from '@/components/app/ProductHistoryView';
import ProductAuditView from '@/components/app/ProductAuditView';
import SettingsView from '@/components/app/SettingsView';
import AIProvidersView from '@/components/app/AIProvidersView';
import LegalReferenceView from '@/components/app/LegalReferenceView';
import BackToTop from '@/components/app/BackToTop';
import CustomCursor from '@/components/app/CustomCursor';
import AuthPanel from '@/components/app/AuthPanel';
import { seedDemoData, migrateScanStatuses, setDemoSeedingEnabled } from '@/lib/local-data';
import { startScanSync } from '@/lib/scan-sync';

/* View routing map — all client-side, single route */
const VIEW_MAP: Record<string, React.ReactNode> = {
  dashboard: <DashboardView />,
  'upload-scan': <UploadScanView />,
  'review-queue': <ReviewQueueView />,
  'compliance-report': <ComplianceReportView />,
  'product-history': <ProductHistoryView />,
  'product-audit': <ProductAuditView />,
  'legal-reference': <LegalReferenceView />,
  'ai-providers': <AIProvidersView />,
  settings: <SettingsView />,
};

function AppContent() {
  const { currentView } = useAppStore();
  return <AppShell>{VIEW_MAP[currentView] || <DashboardView />}</AppShell>;
}

export default function Home() {
  const seeded = useRef(false);
  const { user, hydrated } = useAuth();

  /* Auth-aware boot: demo data ONLY for anonymous first-run; signed-in
     users hydrate their real scans from their account instead. Also runs
     on cookie-restored sessions (reload on any device). */
  useEffect(() => {
    if (!hydrated || seeded.current) return;
    seeded.current = true;
    setDemoSeedingEnabled(!user);
    seedDemoData();
    const fixed = migrateScanStatuses();
    if (fixed > 0) {
      console.log(`[LMCC] Status migration: repaired ${fixed} scan(s) stuck in needs_review`);
    }
    if (user) {
      startScanSync(); // restore scans from the account on any device
    }
  }, [hydrated, user]);

  /* Wait for the server session round-trip before showing anything —
     avoids flashing the login panel for already-signed-in users. */
  if (!hydrated) return null;

  /* Not signed in → sign in / sign up (accounts live server-side) */
  if (!user) {
    return <AuthPanel />;
  }

  return (
    <>
      <AppContent />
      <BackToTop />
      <CustomCursor />
    </>
  );
}
