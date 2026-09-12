/* ═══════════════════════════════════════════════════════════════════════════
   AppShell — Main layout wrapper
   Left sidebar navigation + header + scrollable content + fixed footer
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect } from 'react';
import {
  LayoutDashboard, Upload, ClipboardCheck, History,
  Settings, Shield, Menu, BookOpen, Sun, Moon, Bot,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useTheme } from 'next-themes';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import type { ViewName } from '@/lib/types';

/* ── Navigation Configuration ── */

const NAV_ITEMS: { view: ViewName; label: string; icon: React.ReactNode }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { view: 'upload-scan', label: 'Scan Product', icon: <Upload className="h-[18px] w-[18px]" /> },
  { view: 'review-queue', label: 'Review Queue', icon: <ClipboardCheck className="h-[18px] w-[18px]" /> },
  { view: 'product-history', label: 'Scan History', icon: <History className="h-[18px] w-[18px]" /> },
  { view: 'legal-reference', label: 'Legal Reference', icon: <BookOpen className="h-[18px] w-[18px]" /> },
  { view: 'ai-providers', label: 'AI Providers', icon: <Bot className="h-[18px] w-[18px]" /> },
  { view: 'settings', label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" /> },
];

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  'upload-scan': 'Scan Product',
  'review-queue': 'Review Queue',
  'compliance-report': 'Compliance Report',
  'product-history': 'Scan History',
  'legal-reference': 'Legal Reference',
  'ai-providers': 'AI Providers',
  settings: 'Settings',
};

/* ── Sidebar Content (shared between desktop & mobile Sheet) ── */

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentView, setCurrentView } = useAppStore();
  const { theme, setTheme } = useTheme();

  function handleNav(view: ViewName) {
    setCurrentView(view);
    onNavigate?.();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center"
            style={{ background: 'var(--primary)' }}
          >
            <Shield className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              LMCC
            </h1>
            <p className="text-[10px] leading-tight font-medium" style={{ color: 'var(--text-muted)' }}>
              Legal Metrology Compliance
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 space-y-0.5" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => handleNav(item.view)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-[13px] font-medium transition-colors cursor-pointer ${
                isActive ? 'nav-active' : 'hover:bg-[var(--bg-hover)]'
              }`}
              style={{ color: isActive ? 'var(--primary)' : 'var(--text-secondary)' }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={isActive ? '' : 'opacity-70'}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section: Theme Toggle + Offline Badge */}
      <div className="px-3 pb-5 pt-3 border-t" style={{ borderColor: 'var(--border-light)' }}>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-[13px] font-medium transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark'
            ? <Sun className="h-[18px] w-[18px]" />
            : <Moon className="h-[18px] w-[18px]" />
          }
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <div className="px-3 pt-3">
          <p className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Offline Mode — No internet required
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Theme Toggle for Header (desktop only) ── */

function HeaderThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="btn-ghost !p-2"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark'
        ? <Sun className="h-4 w-4" />
        : <Moon className="h-4 w-4" />
      }
    </button>
  );
}

/* ── Main AppShell ── */

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { currentView, sidebarOpen, setSidebarOpen, toggleSidebar } = useAppStore();

  /* Close mobile sidebar on view change */
  useEffect(() => {
    setSidebarOpen(false);
  }, [currentView, setSidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>
      {/* ── Desktop Sidebar (≥1024px) ── */}
      <aside
        className="hidden lg:flex flex-col shrink-0 border-r"
        style={{ width: 'var(--sidebar-w)', background: 'var(--bg-sidebar)', borderColor: 'var(--border-default)' }}
      >
        <SidebarContent />
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Header ── */}
        <header
          className="h-[var(--header-h)] shrink-0 flex items-center justify-between px-4 md:px-6 border-b"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border-default)' }}
        >
          <div className="flex items-center gap-3">
            {/* Mobile hamburger - only on screens smaller than lg */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <button
                  className="btn-ghost !p-2 desktop-hidden"
                  onClick={toggleSidebar}
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[280px] p-0 !rounded-none"
                style={{ background: 'var(--bg-sidebar)' }}
              >
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <SidebarContent onNavigate={() => setSidebarOpen(false)} />
              </SheetContent>
            </Sheet>

            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {VIEW_TITLES[currentView] ?? 'Dashboard'}
            </h2>
          </div>

          {/* Right side: theme toggle (desktop) */}
          <div className="hidden lg:flex items-center gap-2">
            <HeaderThemeToggle />
          </div>
        </header>

        {/* ── Scrollable Content ── */}
        <main className="flex-1 overflow-y-auto" role="main">
          <div className="animate-fade-in p-4 md:p-6 lg:p-8 pb-8">
            {children}
          </div>
        </main>

        {/* ── Footer (fixed at bottom, outside scroll) ── */}
        <footer
          className="shrink-0 h-10 flex items-center justify-center border-t px-4"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border-light)' }}
          role="contentinfo"
        >
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} SIH26034 LMCC — Dept. of Consumer Affairs, Government of India
          </p>
        </footer>
      </div>
    </div>
  );
}
