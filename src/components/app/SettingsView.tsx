/* ═══════════════════════════════════════════════════════════════════════════
   Settings — Theme, data management, contact form, PWA install
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings as SettingsIcon, Sun, Moon, Trash2, Database, Info, Shield, Send, Download, CheckCircle2, Mail, MessageSquare, User, Loader2, GraduationCap, Scale, FileText, Zap, Github } from 'lucide-react';
import { toast } from 'sonner';
import { fireConfetti } from './easter-eggs';
import { useTheme } from 'next-themes';
import { notifyDataChange } from '@/lib/hooks';
import { seedDemoData } from '@/lib/local-data';
import { getLiteModePref, setLiteModePref, isLiteMode, getLiteModeRecommendation, type LiteModePref } from '@/lib/lite-mode';
import { useAuth, REPO_URL, WATERMARK_LINE, ROLE_LABELS } from '@/lib/auth';
import AccountSecurityCard from './AccountSecurityCard';
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '@/lib/legal-content';
import LegalAccordion from './LegalAccordion';
import {
  isTrainingCaptureEnabled,
  setTrainingCaptureEnabled,
  getTrainingPairCount,
  downloadTrainingPairsZip,
  clearTrainingPairs,
} from '@/lib/training-samples';

/* ── AboutCreditsEgg — tap "SIH26034 — LMCC" five times quickly for the
   hidden credits. Same title, same layout; only a click handler added. ── */

function AboutCreditsEgg() {
  const [taps, setTaps] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onTap() {
    if (timer.current) clearTimeout(timer.current);
    const next = taps + 1;
    if (next >= 5) {
      setTaps(0);
      fireConfetti();
      toast.success('🥚 Built with questionable sleep schedule by Abhinav Datta', {
        description: 'Next.js · Supabase · Tesseract.js · one slightly over-caffeinated laptop — github.com/abhinavdatta',
      });
    } else {
      setTaps(next);
      timer.current = setTimeout(() => setTaps(0), 2_500);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Shield className="h-5 w-5" style={{ color: 'var(--primary)' }} />
      <div>
        <button type="button" onClick={onTap} className="text-sm font-bold cursor-default" style={{ color: 'var(--text-primary)' }}>
          SIH26034 — LMCC
        </button>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Legal Metrology Compliance Checker</p>
      </div>
    </div>
  );
}

/* ── PWA Install Hook ── */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    /* Check if already installed (no prompt event fires if so) */
    if (window.matchMedia('(display-mode: standalone)').matches) {
      /* Use queueMicrotask to avoid synchronous setState in effect */
      queueMicrotask(() => setInstalled(true));
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  /* Listen for app installed event */
  useEffect(() => {
    const handler = () => setInstalled(true);
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstalled(true);
      toast.success('App installed successfully!');
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return { canInstall: !!deferredPrompt && !installed, installed, install };
}

/* ── Contact Form Validation ── */

interface ContactForm {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

/* ── Device diagnostics for issue triage ──
   Everything here is ordinary browser telemetry any site can see
   (screen size, UA string, language, timezone). No fingerprinting
   tricks, no storage reads, no network calls. */

function buildDeviceDiagnostics(): string {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } };
  const lines = [
    `**Environment**`,
    `- Platform: ${nav.platform || 'unknown'}`,
    `- Screen: ${screen.width}x${screen.height} @ ${window.devicePixelRatio || 1}x, viewport ${window.innerWidth}x${window.innerHeight}`,
    `- Language: ${nav.language || 'unknown'}, timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'}`,
    `- Browser: ${(nav.userAgent.match(/(Chrome|Chromium|Firefox|Safari|Edg)\/[\d.]+/g) || ['unknown']).join(', ')}`,
    `- CPU cores: ${nav.hardwareConcurrency ?? 'unknown'}${nav.deviceMemory ? `, RAM ~${nav.deviceMemory} GB` : ''}`,
    `- Network: ${nav.connection?.effectiveType ?? 'unknown'}${typeof nav.onLine === 'boolean' ? `, online: ${nav.onLine}` : ''}`,
    `- Theme: ${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}`,
  ];
  return lines.join('\n');
}

function validateContact(data: ContactForm): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim()) errors.name = 'Name is required';
  if (!data.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Enter a valid email address';
  }
  if (!data.subject.trim()) errors.subject = 'Subject is required';
  if (!data.message.trim()) {
    errors.message = 'Message is required';
  } else if (data.message.trim().length < 10) {
    errors.message = 'Message must be at least 10 characters';
  }
  return errors;
}

/* ── Settings View ── */

export default function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { canInstall, installed, install } = usePWAInstall();
  const { user, signOut } = useAuth();

  /* Contact form state */
  const [contactForm, setContactForm] = useState<ContactForm>({ name: '', email: '', subject: '', message: '' });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  /* Pre-filled GitHub issue URL from the last submit — shown as a
     clickable fallback in case the auto-open tab gets blocked. */
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [formSubmitted, setFormSubmitted] = useState(false);

  /* Lite-mode state; the module dispatches 'lmcc-lite-mode-changed' on change */
  const [litePref, setLitePref] = useState<LiteModePref>(() => getLiteModePref());
  const [liteActive, setLiteActive] = useState(() => isLiteMode());
  useEffect(() => {
    const sync = () => {
      setLitePref(getLiteModePref());
      setLiteActive(isLiteMode());
    };
    window.addEventListener('lmcc-lite-mode-changed', sync);
    return () => window.removeEventListener('lmcc-lite-mode-changed', sync);
  }, []);
  const liteRecommendation = getLiteModeRecommendation();

  /* Training-data capture state (lazy init — localStorage is sync on client) */
  const [trainingEnabled, setTrainingEnabled] = useState(() => isTrainingCaptureEnabled());
  const [trainingPairCount, setTrainingPairCount] = useState(() => {
    // Pair count is async (IndexedDB); start at 0 and subscribe in an effect.
    return 0;
  });
  const [isExportingTraining, setIsExportingTraining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getTrainingPairCount().then((count) => {
      if (!cancelled) setTrainingPairCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleToggleTrainingCapture(enabled: boolean) {
    setTrainingCaptureEnabled(enabled);
    setTrainingEnabled(enabled);
    if (!enabled) {
      void getTrainingPairCount().then(setTrainingPairCount);
      toast.info('Training data capture disabled', {
        description: 'Retained scan images were deleted. Already-saved correction pairs are kept until you clear them.'
      });
    } else {
      toast.success('Training data capture enabled', {
        description: 'Your corrected field values (and the label image region) will be kept for OCR model training.'
      });
    }
  }

  async function handleExportTraining() {
    setIsExportingTraining(true);
    try {
      const count = await downloadTrainingPairsZip();
      if (count === null) {
        toast.info('No training pairs yet', {
          description: 'Correct fields in the Review Queue (with capture enabled) to build training data.'
        });
      } else {
        toast.success(`Exported ${count} training pair${count !== 1 ? 's' : ''}`, {
          description: 'Unzip into training/ground-truth/ — each image ships with its .gt.txt transcription.'
        });
      }
    } finally {
      setIsExportingTraining(false);
    }
  }

  function handleClearTraining() {
    void clearTrainingPairs().then(() => {
      setTrainingPairCount(0);
      toast.info('Training pairs cleared');
    });
  }

  function clearAllData() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lmcc_scans');
      seedDemoData();
      notifyDataChange();
      toast.success('All data cleared and re-seeded with demo data');
    }
  }

  /* Handle contact form submission — opens a pre-filled GitHub issue.
     Nothing is stored or transmitted by the app itself: the visitor's
     own browser opens GitHub, and only pressing "Submit new issue"
     there actually sends it. Honest by construction. */
  function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateContact(contactForm);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const title = `[LMCC Feedback] ${contactForm.subject}`.slice(0, 120);
    const body = [
      contactForm.message,
      '',
      '---',
      `From: ${contactForm.name} (${contactForm.email})`,
      `Page: ${location.href}`,
      `Sent: ${new Date().toLocaleString()}`,
      '',
      '<!-- Auto-attached browser/device diagnostics for bug triage -->',
      buildDeviceDiagnostics(),
    ].join('\n');

    const url = `https://github.com/abhinavdatta/SIH-SIH26034/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    setIssueUrl(url);

    /* Auto-open via a temporary anchor. window.open(url, '_blank',
       features) reads as a POPUP and gets silently killed by blockers and
       embedded webviews; a user-gesture anchor navigation with target=
       _blank is the most permissive path. If even that is swallowed, the
       confirmation screen below shows a real clickable link as fallback. */
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();

    setFormSubmitted(true);
    toast.success('Opening GitHub Issues — press Submit there to send.');
  }

  function handleContactChange(field: keyof ContactForm, value: string) {
    setContactForm(prev => ({ ...prev, [field]: value }));
    /* Clear error on change */
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-static p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
        >
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Configure your LMCC experience</p>
        </div>
      </div>

      {/* ── Account ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Account</h3>
        </div>
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {ROLE_LABELS[user.role]}{user.employeeId ? ` · ${user.employeeId}` : ''}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
              </div>
              <button
                onClick={() => { void signOut(); toast.info('Signed out — scans stay in your account'); }}
                className="btn-ghost shrink-0"
              >
                Sign Out
              </button>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              This identity is stamped into every exported PDF, CSV, and training file. Your account works from any
              device; scans sync to it automatically. Sign-out clears data from this browser only.
            </p>
            <AccountSecurityCard />
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Not signed in.</p>
        )}
      </div>

      {/* ── Appearance ── */}
      <div className="card-static p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Appearance</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark'
              ? <Moon className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              : <Sun className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            }
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Theme</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Currently using {theme} mode</p>
            </div>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn-ghost"
          >
            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      {/* ── Performance (Lite Mode) ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Performance</h3>
          <span
            className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{
              background: liteActive ? 'var(--primary-light)' : 'var(--bg-secondary)',
              color: liteActive ? 'var(--primary)' : 'var(--text-muted)',
            }}
          >
            {liteActive ? 'Lite Mode active' : 'Full mode'}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Lite Mode (low memory use)</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Trims background animations, the custom cursor, smooth scrolling, and hover
              transitions — and scans process at reduced resolution to use far less RAM.
              {litePref === 'auto' && ` ${liteRecommendation.reason}`}
            </p>
          </div>
          <div className="flex shrink-0 gap-1" role="group" aria-label="Lite Mode preference">
            {(['auto', 'on', 'off'] as LiteModePref[]).map((pref) => (
              <button
                key={pref}
                onClick={() => setLiteModePref(pref)}
                className="btn-ghost !px-2.5 !py-1 text-xs capitalize"
                style={
                  litePref === pref
                    ? { background: 'var(--primary-light)', color: 'var(--primary)' }
                    : undefined
                }
                aria-pressed={litePref === pref}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>
        {litePref === 'auto' && (
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
            Auto: Lite Mode turns itself on only for devices reporting ~2GB RAM or 2 or fewer CPU cores.
          </p>
        )}
      </div>

      {/* ── Install App (PWA) ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Install App</h3>
        </div>
        {installed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--success-light)' }}>
              <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--success)' }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--success-text)' }}>App Installed</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>LMCC is installed and works as a standalone app.</p>
            </div>
          </div>
        ) : canInstall ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Install LMCC on your device</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Get quick access, scan without a server account, and receive updates.</p>
            </div>
            <button onClick={install} className="btn-primary shrink-0">
              <Download className="h-4 w-4" /> Install App
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
                ? 'App is running in standalone mode.'
                : 'PWA installation is available on supported browsers. Try accessing this page on a mobile device or Chrome desktop.'}
            </p>
          </div>
        )}
      </div>

      {/* ── Data Management ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Data Management</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Clear All Scan Data</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Remove all saved scans and re-seed demo data</p>
          </div>
          <button
            onClick={clearAllData}
            className="btn-ghost"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear Data
          </button>
        </div>
      </div>

      {/* ── Training Data (opt-in) ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Training Data</h3>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Keep my corrections for OCR model training
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <strong>Off by default.</strong> When on, a downscaled copy of each scanned label is kept on this
              device for 7 days. If you later correct a field in the Review Queue, the label region plus your
              corrected text are saved as a labeled training example. Nothing is uploaded — everything stays in
              your browser until you export it yourself.
            </p>
          </div>
          <button
            onClick={() => handleToggleTrainingCapture(!trainingEnabled)}
            className="btn-ghost shrink-0"
            role="switch"
            aria-checked={trainingEnabled}
          >
            {trainingEnabled ? 'On' : 'Off'}
          </button>
        </div>

        {trainingEnabled && (
          <div className="flex items-start gap-2 mt-3 p-3 rounded-md text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
            <span>
              Capture is <strong>active</strong> — corrections you make in the Review Queue are being retained as
              training examples (currently {trainingPairCount} pair{trainingPairCount !== 1 ? 's' : ''} stored).
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={handleExportTraining}
            disabled={isExportingTraining || trainingPairCount === 0}
            className="btn-ghost"
          >
            {isExportingTraining
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
              : <><Download className="h-3.5 w-3.5" /> Export training ZIP ({trainingPairCount})</>}
          </button>
          <button
            onClick={handleClearTraining}
            disabled={trainingPairCount === 0}
            className="btn-ghost"
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear pairs
          </button>
        </div>          <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
            The ZIP contains <code>ground-truth/&lt;name&gt;.png</code> + <code>&lt;name&gt;.gt.txt</code> pairs — drop its
            contents straight into <code>training/ground-truth/</code> for tesstrain, or upload it into the Colab
            notebook. Review the .gt.txt files before training. The exporter&apos;s identity is recorded in
            <code>corrections.csv</code>.
          </p>
      </div>

      {/* ── Contact Form ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-5">
          <MessageSquare className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Contact Us</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Submitting opens your message as a pre-filled GitHub issue in a new tab — nothing is stored on this site. Basic browser/device info (screen size, browser, OS) is attached to help reproduce bugs.
        </p>

        {formSubmitted ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--success-light)' }}>
              <CheckCircle2 className="h-6 w-6" style={{ color: 'var(--success)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Opening GitHub Issues…</p>
            <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Your message opens as a pre-filled issue in a new tab — press <strong>Submit new issue</strong> on GitHub to send it. Issues are public.
            </p>
            {issueUrl && (
              <a
                href={issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2 mt-4"
              >
                <Github className="h-4 w-4" /> Open GitHub Issues
              </a>
            )}
            <button
              onClick={() => { setFormSubmitted(false); setIssueUrl(null); setContactForm({ name: '', email: '', subject: '', message: '' }); }}
              className="btn-ghost mt-4"
            >
              Send Another Message
            </button>
          </div>
        ) : (
          <form onSubmit={handleContactSubmit} className="space-y-4" noValidate>
            {/* Name + Email row */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-name" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <User className="h-3 w-3 inline mr-1" /> Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  placeholder="Your name"
                  value={contactForm.name}
                  onChange={e => handleContactChange('name', e.target.value)}
                  className={`input-base w-full ${formErrors.name ? '!border-[var(--danger)]' : ''}`}
                  aria-required="true"
                  aria-invalid={!!formErrors.name}
                  aria-describedby={formErrors.name ? 'name-error' : undefined}
                />
                {formErrors.name && <p id="name-error" className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{formErrors.name}</p>}
              </div>
              <div>
                <label htmlFor="contact-email" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <Mail className="h-3 w-3 inline mr-1" /> Email <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  placeholder="you@example.com"
                  value={contactForm.email}
                  onChange={e => handleContactChange('email', e.target.value)}
                  className={`input-base w-full ${formErrors.email ? '!border-[var(--danger)]' : ''}`}
                  aria-required="true"
                  aria-invalid={!!formErrors.email}
                  aria-describedby={formErrors.email ? 'email-error' : undefined}
                />
                {formErrors.email && <p id="email-error" className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{formErrors.email}</p>}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label htmlFor="contact-subject" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Subject <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="contact-subject"
                type="text"
                placeholder="What is this about?"
                value={contactForm.subject}
                onChange={e => handleContactChange('subject', e.target.value)}
                className={`input-base w-full ${formErrors.subject ? '!border-[var(--danger)]' : ''}`}
                aria-required="true"
                aria-invalid={!!formErrors.subject}
                aria-describedby={formErrors.subject ? 'subject-error' : undefined}
              />
              {formErrors.subject && <p id="subject-error" className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{formErrors.subject}</p>}
            </div>

            {/* Message */}
            <div>
              <label htmlFor="contact-message" className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Message <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea
                id="contact-message"
                rows={4}
                placeholder="Describe your issue or feedback..."
                value={contactForm.message}
                onChange={e => handleContactChange('message', e.target.value)}
                className={`input-base w-full resize-none ${formErrors.message ? '!border-[var(--danger)]' : ''}`}
                aria-required="true"
                aria-invalid={!!formErrors.message}
                aria-describedby={formErrors.message ? 'message-error' : undefined}
              />
              {formErrors.message && <p id="message-error" className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{formErrors.message}</p>}
            </div>

            <button type="submit" disabled={formSubmitting} className="btn-primary w-full py-3">
              {formSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send Message</>}
            </button>
          </form>
        )}
      </div>

      {/* ── About ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>About LMCC</h3>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-light)' }}>
          <AboutCreditsEgg />
          <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--text-secondary)' }}>
            An AI-powered tool for verifying packaged commodity label compliance under the
            Legal Metrology (Packaged Commodities) Rules, 2011, Government of India.
            Built for Smart India Hackathon 2024.
          </p>
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
            All data is processed and stored locally on your device. No data is sent to any server
            unless you enable cloud OCR with your own AI provider.
          </p>
        </div>
      </div>

      {/* ── Legal: Terms & Conditions + Privacy Policy ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Legal</h3>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Terms &amp; Conditions</p>
          </div>
          <LegalAccordion sections={TERMS_SECTIONS} />
          <div className="flex items-center gap-2 mt-4 mb-2">
            <Shield className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Privacy Policy</p>
          </div>
          <LegalAccordion sections={PRIVACY_SECTIONS} />
          <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
            Last updated: September 2026. LMCC is a Smart India Hackathon project; these documents
            describe the app as it ships — fully client-side storage with optional user-configured AI providers.
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Source &amp; author:{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>
              {WATERMARK_LINE}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
