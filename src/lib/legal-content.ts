// ═══════════════════════════════════════════════════════════════
// Legal Content — Terms & Conditions + Privacy Policy copy.
// Kept as data (not JSX) so the Settings accordions render it with
// consistent styling; content is scoped to how LMCC actually works:
// fully client-side, localStorage/IndexedDB only, optional AI providers.
// ═══════════════════════════════════════════════════════════════

export interface LegalSection {
  heading: string;
  body: string[];
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '1. Acceptance of terms',
    body: [
      'By using LMCC (Legal Metrology Compliance Checker) you agree to these terms. If you do not agree, please do not use the app.',
    ],
  },
  {
    heading: '2. What LMCC does',
    body: [
      'LMCC verifies packaged-commodity label fields against the Legal Metrology (Packaged Commodities) Rules, 2011 (India). Results are advisory compliance indicators only.',
    ],
  },
  {
    heading: '3. No legal advice',
    body: [
      'LMCC does not provide legal advice and is not a substitute for professional compliance review. Compliance determinations remain the responsibility of the manufacturer, packer, importer, or marketer. A "compliant" result is not a legal certification, and a "non-compliant" result should be verified before any action is taken.',
    ],
  },
  {
    heading: '4. OCR and AI extraction accuracy',
    body: [
      'Field values are extracted by automated OCR (Tesseract.js, running in your browser) and, if you configure one, an external AI provider you choose. Automated extraction can misread or omit text. You are responsible for verifying extracted values against the original label before relying on them.',
    ],
  },
  {
    heading: '5. Your data',
    body: [
      'Scans, corrections, and settings are stored only on your device (browser localStorage and IndexedDB). Clearing your browser data, using private browsing, or uninstalling the app removes it permanently. We cannot recover data stored only on your device.',
    ],
  },
  {
    heading: '6. External AI providers',
    body: [
      'If you enable cloud OCR (OpenRouter, NVIDIA NIM, or a custom provider), label images are sent directly from your browser to that provider under its own terms and privacy policy. LMCC\'s server never stores your keys or images, but you should review the provider\'s terms before sending label images to it. Local OCR mode never sends anything anywhere.',
    ],
  },
  {
    heading: '7. Acceptable use',
    body: [
      'Use LMCC only for label compliance checking. Do not attempt to disrupt, reverse-engineer protected components of the service, or use it to process content you have no right to process.',
    ],
  },
  {
    heading: '8. Warranty and liability',
    body: [
      'LMCC is provided "as is", without warranties of any kind. To the maximum extent permitted by law, the authors are not liable for any damages arising from use of the app, including decisions made in reliance on its results.',
    ],
  },
  {
    heading: '9. Changes',
    body: [
      'These terms may be updated as the app evolves. Material changes will be reflected on this page.',
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: '1. Summary',
    body: [
      'LMCC is offline-first. Your scans and settings stay on your device. We do not operate an analytics service, do not track you, and do not sell data — there is no account and no server-side storage of your information.',
    ],
  },
  {
    heading: '2. What is stored on your device',
    body: [
      'Scan records, extracted fields, review decisions, and app settings (theme, AI provider configuration, preferences) are kept in your browser\'s localStorage. Optional OCR training samples (only if you enable them in Settings) are kept in IndexedDB and never leave your device unless you export them yourself.',
    ],
  },
  {
    heading: '3. What is never collected',
    body: [
      'No account or identity information, no analytics or telemetry, no cookies for tracking, no advertising identifiers. The contact form in Settings composes a message locally; nothing is transmitted by the app itself.',
    ],
  },
  {
    heading: '4. When data leaves your device',
    body: [
      'Only in two cases, both user-initiated: (a) you run a scan in cloud OCR mode — the label image is sent by your browser to the AI provider you configured (OpenRouter, NVIDIA, or custom) to extract fields; or (b) you explicitly export data (PDF/CSV report, training ZIP) and choose to share it.',
    ],
  },
  {
    heading: '5. AI provider keys',
    body: [
      'API keys you enter are stored in your browser\'s localStorage and sent only to the provider you configured. They are not sent to LMCC\'s own infrastructure for storage. Validation requests to /api/validate-api-key forward your key to the provider\'s official endpoint only, over HTTPS, to verify it works.',
    ],
  },
  {
    heading: '6. Data retention and deletion',
    body: [
      'Data persists on your device until you delete it: use Settings → Clear Data for scan data, the Training Data controls for training samples, or clear site data in your browser to remove everything.',
    ],
  },
  {
    heading: '7. Your choices',
    body: [
      'You can use LMCC entirely without cloud OCR (Local mode), disable training-data capture (it is off by default), and clear any or all stored data at any time from Settings.',
    ],
  },
  {
    heading: '8. Contact',
    body: [
      'Questions about this policy can be sent through the contact form in Settings.',
    ],
  },
];
