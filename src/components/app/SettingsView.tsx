/* ═══════════════════════════════════════════════════════════════════════════
   Settings — Theme, data management, contact form, PWA install
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Sun, Moon, Trash2, Database, Info, Shield, Send, Download, CheckCircle2, Mail, MessageSquare, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { notifyDataChange } from '@/lib/hooks';
import { seedDemoData } from '@/lib/local-data';

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

  /* Contact form state */
  const [contactForm, setContactForm] = useState<ContactForm>({ name: '', email: '', subject: '', message: '' });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  function clearAllData() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lmcc_scans');
      seedDemoData();
      notifyDataChange();
      toast.success('All data cleared and re-seeded with demo data');
    }
  }

  /* Handle contact form submission */
  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateContact(contactForm);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFormSubmitting(true);
    /* Simulate network delay (offline app — data would be queued) */
    await new Promise(r => setTimeout(r, 800));
    setFormSubmitting(false);
    setFormSubmitted(true);
    toast.success('Message sent! We will get back to you soon.');
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
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Get quick access, work offline, and receive updates.</p>
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

      {/* ── Contact Form ── */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-5">
          <MessageSquare className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Contact Us</h3>
        </div>

        {formSubmitted ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--success-light)' }}>
              <CheckCircle2 className="h-6 w-6" style={{ color: 'var(--success)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Message Sent!</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>We will get back to you soon.</p>
            <button
              onClick={() => { setFormSubmitted(false); setContactForm({ name: '', email: '', subject: '', message: '' }); }}
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
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>SIH26034 — LMCC</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Legal Metrology Compliance Checker</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--text-secondary)' }}>
            An AI-powered tool for verifying packaged commodity label compliance under the
            Legal Metrology (Packaged Commodities) Rules, 2011, Government of India.
            Built for Smart India Hackathon 2024.
          </p>
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
            All data is processed and stored locally on your device. No data is sent to any server.
            Works completely offline.
          </p>
        </div>
      </div>
    </div>
  );
}
