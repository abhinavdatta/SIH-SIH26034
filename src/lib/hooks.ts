// ═══════════════════════════════════════════════════
// Hooks — reactive client-side data hooks
// Uses useSyncExternalStore with module-level caching for stable references.
// ═══════════════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';
import { PRODUCT_FIELDS } from './extract/types';
import * as localData from './local-data';

/* ── External Store Subscription ── */

let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

/** Notify all subscribers that data has changed (call after localStorage writes) */
export function notifyDataChange() {
  // Invalidate all caches so next getSnapshot reads fresh data
  dashboardCache = null;
  scansCache = null;
  Object.keys(scanCacheMap).forEach(key => delete scanCacheMap[key]);
  reviewQueueCache = null;
  for (const l of listeners) l();
}

/* ── Dashboard ── */

const EMPTY_DASHBOARD: localData.DashboardStats = {
  totalScans: 0, compliantScans: 0, nonCompliantScans: 0,
  needsReviewScans: 0, extractedScans: 0, violationRate: 0,
  recentScans: [],
  violationByType: [],
  scansByStatus: [],
  topViolatedFields: [],
};

let dashboardCache: localData.DashboardStats | null = null;

function getDashboardSnapshot() {
  if (!dashboardCache) dashboardCache = localData.getDashboardStats();
  return dashboardCache;
}

export function useDashboard() {
  return useSyncExternalStore(subscribe, getDashboardSnapshot, () => EMPTY_DASHBOARD);
}

/* ── Scans List ── */

const EMPTY_SCANS: localData.LocalScan[] = [];
let scansCache: localData.LocalScan[] | null = null;

function getScansSnapshot() {
  if (!scansCache) scansCache = localData.getAllScans();
  return scansCache;
}

export function useScans() {
  return useSyncExternalStore(subscribe, getScansSnapshot, () => EMPTY_SCANS);
}

/* ── Single Scan ── */

const scanCacheMap: Record<string, ReturnType<typeof localData.getScanById>> = {};

function makeScanGetter(id: string) {
  return () => {
    if (!(id in scanCacheMap)) scanCacheMap[id] = localData.getScanById(id);
    return scanCacheMap[id];
  };
}

export function useScan(id: string) {
  return useSyncExternalStore(subscribe, makeScanGetter(id), () => null);
}

/* ── Review Queue ── */

const EMPTY_QUEUE: localData.ReviewQueueItem[] = [];
let reviewQueueCache: typeof EMPTY_QUEUE | null = null;

function getReviewQueueSnapshot() {
  if (!reviewQueueCache) reviewQueueCache = localData.getReviewQueue();
  return reviewQueueCache;
}

export function useReviewQueue() {
  return useSyncExternalStore(subscribe, getReviewQueueSnapshot, () => EMPTY_QUEUE);
}

/* ── Field Label Helpers ── */

export function getFieldLabel(key: string): string {
  return (PRODUCT_FIELDS as readonly { key: string; label: string }[]).find(f => f.key === key)?.label ?? key;
}

export function getFieldGroup(key: string): string {
  return (PRODUCT_FIELDS as readonly { key: string; group: string }[]).find(f => f.key === key)?.group ?? 'other';
}
