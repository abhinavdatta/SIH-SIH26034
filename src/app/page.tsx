/* ═══════════════════════════════════════════════════════════════════════════
   Page Entry — Single-route SPA, all client-side navigation via Zustand
   Seeds demo data on first load, then renders the AppShell.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import AppShell from '@/components/app/AppShell';
import DashboardView from '@/components/app/DashboardView';
import UploadScanView from '@/components/app/UploadScanView';
import ReviewQueueView from '@/components/app/ReviewQueueView';
import ComplianceReportView from '@/components/app/ComplianceReportView';
import ProductHistoryView from '@/components/app/ProductHistoryView';
import SettingsView from '@/components/app/SettingsView';
import AIProvidersView from '@/components/app/AIProvidersView';
import LegalReferenceView from '@/components/app/LegalReferenceView';
import BackToTop from '@/components/app/BackToTop';
import CustomCursor from '@/components/app/CustomCursor';
import { seedDemoData, migrateScanStatuses } from '@/lib/local-data';

/* View routing map — all client-side, single route */
const VIEW_MAP: Record<string, React.ReactNode> = {
  dashboard: <DashboardView />,
  'upload-scan': <UploadScanView />,
  'review-queue': <ReviewQueueView />,
  'compliance-report': <ComplianceReportView />,
  'product-history': <ProductHistoryView />,
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
  const [mounted, setMounted] = useState(false);

  /* Wait for client mount to prevent flash of unstyled content */
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  /* Seed demo data on first visit + one-time repair of pre-fix scan statuses */
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      seedDemoData();
      const fixed = migrateScanStatuses();
      if (fixed > 0) {
        console.log(`[LMCC] Status migration: repaired ${fixed} scan(s) stuck in needs_review`);
      }
    }
  }, []);

  if (!mounted) return null;

  return (
    <>
      <AppContent />
      <BackToTop />
      <CustomCursor />
    </>
  );
}
