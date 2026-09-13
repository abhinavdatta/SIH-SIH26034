// ═══════════════════════════════════════════════════════════════
// Zustand Store — Application state (no auth required)
// ═══════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type { ViewName } from './types';

interface AppState {
  currentView: ViewName;
  setCurrentView: (view: ViewName) => void;
  selectedScanId: string | null;
  setSelectedScanId: (id: string | null) => void;
  /** Scan currently being edited via the Product Audit form (null = create mode). */
  editingScanId: string | null;
  setEditingScanId: (id: string | null) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  refreshCounter: number;
  triggerRefresh: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view, sidebarOpen: false }),
  selectedScanId: null,
  setSelectedScanId: (id) => set({ selectedScanId: id }),
  editingScanId: null,
  setEditingScanId: (id) => set({ editingScanId: id }),

  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  refreshCounter: 0,
  triggerRefresh: () => set((s) => ({ refreshCounter: s.refreshCounter + 1 })),
}));
