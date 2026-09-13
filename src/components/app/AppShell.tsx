/* ═══════════════════════════════════════════════════════════════════════════
   AppShell — Main layout wrapper
   Left sidebar navigation + header + scrollable content + fixed footer
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Upload, ClipboardCheck, History,
  Settings, Shield, Menu, BookOpen, Sun, Moon, Bot, Keyboard, X, FileSearch,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useTheme } from 'next-themes';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import type { ViewName } from '@/lib/types';
import { matchShortcut, VIEW_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { isLiteMode } from '@/lib/lite-mode';
import { useAuth, REPO_URL, WATERMARK_LINE, ROLE_LABELS } from '@/lib/auth';
import type { UserRole } from '@/lib/auth';

/* ── Signed-in user chip — identity that gets stamped into exports ── */

function UserChip() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const roleLabel = user.role === 'seller' ? 'Seller' : 'Compliance Officer';
  return (
    <div className="px-3 pb-3">
      <div
        className="w-full flex items-center gap-2.5 p-2 rounded-[var(--radius-md)] border"
        style={{ borderColor: 'var(--border-light)', background: 'var(--bg-input)' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: 'var(--primary)', color: '#fff' }}
          aria-hidden="true"
        >
          {initials || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
          <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
            {roleLabel}{user.employeeId ? ` · ${user.employeeId}` : ''}
          </p>
        </div>
        <button
          onClick={() => { void signOut(); }}
          className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Sign out"
          title="Sign out — scans stay in your account and re-sync on next sign-in"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/* ── Skip Link — first focusable element; jumps past the sidebar to content ── */

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100000] focus:px-4 focus:py-2 focus:rounded-[var(--radius-md)] focus:text-sm focus:font-medium"
      style={{ background: 'var(--primary)', color: '#fff' }}
    >
      Skip to main content
    </a>
  );
}

/* ── Keyboard Shortcuts Cheat Sheet (Alt+K) ── */

function ShortcutsCheatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-sm rounded-[var(--radius-lg)] p-5 border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Keyboard className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            Keyboard shortcuts
          </h3>
          <button onClick={onClose} className="btn-ghost !p-1.5" aria-label="Close keyboard shortcuts">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {VIEW_SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between text-[13px]">
              <span style={{ color: 'var(--text-secondary)' }}>{s.description}</span>
              <kbd
                className="px-2 py-0.5 rounded font-mono text-[11px] border"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
              >
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
          Tab / Shift+Tab moves between controls. Buttons are also reachable with arrow keys inside lists.
        </p>
      </div>
    </div>
  );
}

/* ── Navigation Configuration ── */

const NAV_ITEMS: { view: ViewName; label: string; icon: React.ReactNode; officerOnly?: boolean }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { view: 'upload-scan', label: 'Scan Product', icon: <Upload className="h-[18px] w-[18px]" /> },
  { view: 'review-queue', label: 'Review Queue', icon: <ClipboardCheck className="h-[18px] w-[18px]" />, officerOnly: true },
  { view: 'product-history', label: 'Scan History', icon: <History className="h-[18px] w-[18px]" /> },
  { view: 'product-audit', label: 'Product Audit', icon: <FileSearch className="h-[18px] w-[18px]" /> },
  { view: 'legal-reference', label: 'Legal Reference', icon: <BookOpen className="h-[18px] w-[18px]" />, officerOnly: true },
  { view: 'ai-providers', label: 'AI Providers', icon: <Bot className="h-[18px] w-[18px]" /> },
  { view: 'settings', label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" /> },
];

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  'upload-scan': 'Scan Product',
  'review-queue': 'Review Queue',
  'compliance-report': 'Compliance Report',
  'product-history': 'Scan History',
  'product-audit': 'Product Declarations Audit',
  'legal-reference': 'Legal Reference',
  'ai-providers': 'AI Providers',
  settings: 'Settings',
};

/* ── Sidebar Content (shared between desktop & mobile Sheet) ── */

/* Views a role can open. Sellers: their work surfaces; Compliance
   Officers: everything. */
const ROLE_VIEWS: Record<UserRole, ViewName[]> = {
  seller: ['dashboard', 'upload-scan', 'product-history', 'product-audit', 'ai-providers', 'settings', 'compliance-report'],
  compliance_officer: [
    'dashboard', 'upload-scan', 'review-queue', 'product-history',
    'legal-reference', 'product-audit', 'ai-providers', 'settings', 'compliance-report',
  ],
};

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentView, setCurrentView } = useAppStore();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const allowed = ROLE_VIEWS[user?.role ?? 'seller'];

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

      <UserChip />

      {/* Navigation Links — filtered by role */}
      <nav className="flex-1 px-3 space-y-0.5" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.filter((item) => !item.officerOnly || user?.role === 'compliance_officer').map((item) => {
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => handleNav(item.view)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const buttons = Array.from(
                    e.currentTarget.closest('nav')?.querySelectorAll<HTMLButtonElement>('button') ?? []
                  );
                  const idx = buttons.indexOf(e.currentTarget);
                  const next = buttons[(idx + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length];
                  next?.focus();
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-[13px] font-medium transition-colors cursor-pointer roving-tabindex ${
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

      {/* Bottom Section: Theme Toggle */}
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
          <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Legal Metrology (Packaged Commodities) Rules, 2011
          </p>
          <p className="text-[10px] mt-1">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: 'var(--primary)' }}
            >
              {WATERMARK_LINE}
            </a>
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
  const { currentView, sidebarOpen, setSidebarOpen, toggleSidebar, setCurrentView } = useAppStore();
  const { user } = useAuth();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  /* Role guard: if the current view is not permitted (or unknown), fall
     back to the dashboard. Covers deep links + stale stores after a
     role change. */
  useEffect(() => {
    const allowed = ROLE_VIEWS[user?.role ?? 'seller'];
    if (!allowed.includes(currentView as ViewName)) {
      setCurrentView('dashboard');
    }
  }, [currentView, user?.role, setCurrentView]);

  /* Close mobile sidebar on view change + move focus to the content region
     so keyboard users continue from the top of the new view (tabIndex=-1). */
  useEffect(() => {
    setSidebarOpen(false);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [currentView, setSidebarOpen]);

  /* Global keyboard shortcuts: Alt+1..7 switch views (role-filtered),
     Alt+K toggles the cheat sheet. Single window listener. */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const shortcut = matchShortcut(e);
      if (!shortcut) return;
      e.preventDefault();
      if (shortcut.view === 'cheatsheet') {
        setShortcutsOpen((open) => !open);
        return;
      }
      const allowed = ROLE_VIEWS[user?.role ?? 'seller'];
      if (allowed.includes(shortcut.view as ViewName)) {
        setCurrentView(shortcut.view);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCurrentView, user?.role]);

  /* Lite Mode: body class drives CSS downgrades (animations, cursor,
     transitions). Re-applied when Settings changes the preference. */
  useEffect(() => {
    const apply = () => document.body.classList.toggle('lite-mode', isLiteMode());
    apply();
    window.addEventListener('lmcc-lite-mode-changed', apply);
    return () => window.removeEventListener('lmcc-lite-mode-changed', apply);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-page)' }}>
      <SkipLink />
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
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto outline-none"
          role="main"
        >
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
            © {new Date().getFullYear()} SIH26034 LMCC — Dept. of Consumer Affairs, Government of India ·{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>
              {WATERMARK_LINE}
            </a>
          </p>
        </footer>
      </div>

      <ShortcutsCheatSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
