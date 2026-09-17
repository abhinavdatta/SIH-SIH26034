<div align="center">

# ⚖️ LMCC — Legal Metrology Compliance Checker

### AI-powered compliance auditing for Indian packaged-commodity labels

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tesseract.js](https://img.shields.io/badge/OCR-Tesseract%205-1a73e8)](https://github.com/naptha/tesseract.js)
[![Smart India Hackathon](https://img.shields.io/badge/SIH-26034-8b5cf6)](https://www.sih.gov.in)
[![License](https://img.shields.io/badge/status-hackathon--project-orange)](#-author)

*Verify any product label against the **Legal Metrology (Packaged Commodities) Rules, 2011** —
by scanning it with OCR + AI, or auditing it manually. Built for sellers, FPOs, and
compliance officers who need an answer in seconds, not hours.*

**SIH26034 · Dept. of Consumer Affairs, Government of India**

</div>

## Credits

- [Kurakula Jahnavi | LinkedIn](https://www.linkedin.com/in/kurakula-jahnavi/)
- [Venkata Kasinagaraju Kurra | LinkedIn](https://www.linkedin.com/in/venkata-kasinagaraju-kurra-1b703838b/)
- [Ranganayakulu Kottamasu | LinkedIn](https://www.linkedin.com/in/ranganayakulu-kottamasu-711533362/)
- [Abhinav Datta | LinkedIn](https://www.linkedin.com/in/abhinav-datta-kaly/)
- L. Swathi Sree
- T. Lavanya

---

## 📖 Table of Contents

- [What is LMCC?](#-what-is-lmcc)
- [✨ Features](#-features)
- [🔧 How It Works](#-how-it-works)
- [🚀 Run It Locally](#-run-it-locally)
- [🔐 Accounts, Roles & Security](#-accounts-roles--security)
- [🤖 Connecting Free AI Providers](#-connecting-free-ai-providers)
- [🎯 Train Your Own OCR Model](#-train-your-own-ocr-model)
- [🪶 Lite Mode (low-memory devices)](#-lite-mode-low-memory-devices)
- [⌨️ Keyboard Shortcuts](#️-keyboard-shortcuts)
- [📁 Project Structure](#-project-structure)
- [📚 Documentation](#-documentation)
- [👤 Author](#-author)

---

## 🧐 What is LMCC?

Every retail package in India must declare its manufacturer, net quantity, MRP,
dates, and customer-care details under the **Legal Metrology (Packaged Commodities)
Rules, 2011**. Manually checking a label against those rules is slow and error-prone.

**LMCC** closes that gap:

1. 📸 **Scan** a product label photo (or fill the manual audit form)
2. 🔍 **OCR + optional AI vision** extract every mandatory declaration
3. ⚖️ The **rules engine** evaluates each field against specific rules
4. 👤 A human **reviews** low-confidence fields in the Review Queue
5. 📄 **Export** a stamped, print-ready compliance report (PDF/CSV)

Everything runs in a single Next.js app. Scans sync to your account so the same
login works from **any device**.

---

## ✨ Features

| | Feature | Details |
|---|---|---|
| 📷 | **Three OCR modes** | `Local` (Tesseract in your browser, zero data leaves the device) · `AI` (cloud vision LLM) · `Hybrid` (local first, AI fallback only for high-severity fields) |
| ⚖️ | **Rules engine** | Field-level verdicts (`compliant / needs_review / missing / non_compliant`) with rule references, severity, and human-readable notes |
| 🔢 | **Character whitelisting** | Second, targeted OCR pass restricted to valid characters for MRP (incl. `₹`), net quantity, and dates — kills "8"→"B" misreads |
| 🧾 | **Product Declarations Audit** | Manual entry form with a live compliance preview — audit a product without any photo at all |
| ✏️ | **Edit anything, anywhere** | Review Queue overrides, and full **Edit** from Scan History that re-runs the engine and updates the scan in place |
| 👥 | **Roles** | *Seller* (upload & audit products) and *Compliance Officer / Admin* (everything + Review Queue + Legal Reference) |
| 🔄 | **Cross-device sync** | Accounts and scans live server-side (Upstash Redis) — sign in anywhere and your history is there |
| 🔒 | **Privacy-first security** | Raw passwords never leave the browser (client-derived PBKDF2 verifier), PII encrypted at rest (AES-256-GCM), httpOnly session cookies |
| 📊 | **Dashboard** | Live compliance stats, recent scans, and violation breakdowns |
| 📄 | **Stamped exports** | PDF (formatted report w/ tables & page furniture) and CSV — every export records *who* produced it (name · employee ID · email) |
| 🎯 | **Self-improving OCR** | Reviewer corrections are captured (opt-in) as labeled training pairs and export straight into the training pipeline |
| 🪶 | **Lite Mode** | Auto-detects low-RAM devices (≤2GB / ≤2 cores) and trims canvas sizes, animations, and the custom cursor |
| ♿ | **Accessible** | Skip link, visible focus rings, `prefers-reduced-motion` support, full keyboard navigation (`Alt+1…7`, `Alt+K` cheat sheet) |
| 🌗 | **Dark / light theme** | System-aware with a manual toggle |

---

## 🔧 How It Works

```mermaid
flowchart LR
    A[Label photo<br/>or manual form] --> B{Mode?}
    B -->|Local| C[Tesseract.js<br/>in-browser OCR]
    B -->|AI| D[Cloud vision LLM<br/>OpenRouter / NVIDIA]
    B -->|Hybrid| C
    C --> E{High-severity<br/>fields found?}
    E -->|yes| D
    E -->|no| F[Local result]
    D --> G[Field extraction<br+confidence]
    C -->|numeric fields| H[Whitelisted<br/>2nd pass refines]
    H --> G
    F --> G
    G --> I[⚖️ Compliance engine<br/>Rules 2011]
    I --> J[Review Queue<br/>human approves/overrides]
    J --> K[Stamped PDF / CSV<br/>+ training pairs]
```

**The compliance engine** (`src/lib/compliance-rules.ts`) holds one check per
mandatory field — MRP formatting, net-quantity units, date presence, manufacturer
identity, importer declarations for imported items, consumer-care details, and more.
Each check returns a status, the rule reference (e.g. *Rule 6(1)(a)*), severity, and
an explanation that lands in the report and the reviewer's queue.

---

## 🚀 Run It Locally

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 18+ (20 recommended) | [nodejs.org](https://nodejs.org) |
| **Bun** *(recommended)* | 1.1+ | `npm`/`pnpm`/`yarn` also work |
| **Upstash Redis** *(optional)* | free tier | only for cross-device accounts/sync |
| **Git** | any | to clone |

### Install & run

```bash
# 1 · Clone
git clone https://github.com/abhinavdatta/SIH-SIH26034.git
cd SIH-SIH26034

# 2 · Install dependencies
bun install        # or: npm install

# 3 · Environment (optional — the app runs without it)
cp .env.example .env   # if present, or create .env with the vars below

# 4 · Start
bun run dev        # or: npm run dev
```

Open **http://localhost:3000** → create an account (pick a role) → scan a label
from `training/images/` or audit a product manually.

<details>
<summary><b>Environment variables</b> (click to expand)</summary>

```env
# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Accounts & cross-device sync (optional but recommended) ──
# Free tier: upstash.com → Redis → REST credentials.
# Without these, accounts still SURVIVE restarts via a local .data/ store
# (per-server); set Upstash to share logins across different machines.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Server pepper: encrypts user PII + HMACs email lookups. Generate:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_PEPPER=
```

> AI provider keys are **not** env vars — they're configured per-user in the
> app's **AI Providers** screen and stored locally.
</details>

<details>
<summary><b>Production build</b></summary>

```bash
bun run build
bun run start
```

The project targets **Vercel's Hobby plan** (10s serverless cap) — see
[docs/SETUP.md](docs/SETUP.md) for the timeout implications and mitigations.
</details>

---

## 🔐 Accounts, Roles & Security

**Two roles at sign-up:**

| Role | Gets |
|---|---|
| 🏪 **Seller** | Dashboard · Scan Product · Scan History (view/edit) · Product Audit · AI Providers · Settings |
| 🛡️ **Compliance Officer / Admin** | Everything above **plus** Review Queue (approve/override OCR fields) and the full Legal Reference |

**Same login on every device** — accounts, sessions, and scans live server-side.
Sign out on a shared machine wipes only that browser's cache; the account copy is
safe and re-hydrates at the next sign-in.

**Built-in guardrails** (because plaintext credentials are how projects end up on
the news):

- 🔑 **The raw password never leaves the browser.** The client derives a
  PBKDF2-SHA256 verifier (150k iterations, per-user salt) and sends only that —
  open the network tab and you'll see an opaque blob, never a password. The server
  then scrypt-hashes the verifier again before storing (DB leak ≠ replayable login).
- 🧊 **PII encrypted at rest.** Name/email/employee ID are AES-256-GCM encrypted
  with a key derived from `AUTH_PEPPER`; email lookups use an HMAC index — a
  database dump without the env secret reveals no user PII.
- 🍪 **httpOnly session cookies** (SameSite=Lax) — no tokens in localStorage for
  XSS to steal.
- 🐢 **Timing-safe comparison** + deliberately vague sign-in errors (no user
  enumeration) + per-IP/email rate limiting.

---

## 🤖 Connecting Free AI Providers

1. Open **AI Providers** in the sidebar
2. Pick a preset (OpenRouter & NVIDIA NIM included) or **Add Custom Provider**
3. Paste your key → **Test connection** → Save → enable the toggle

Each field has a *"Where do I find these?"* helper with concrete examples, and the
app links to [awesome-freellm-apis](https://github.com/open-free-llm-api/awesome-freellm-apis)
— a curated catalogue of free LLM APIs and their key signup pages.

No AI provider? Everything still works in **Local mode** — Tesseract runs entirely
in your browser.

---

## 🎯 Train Your Own OCR Model

The stock Tesseract model is decent; **yours will be better on your labels**.
The `training/` folder is a complete fine-tuning pipeline for a Tesseract 5 LSTM:

```
training/
├── images/                 ← put your label photos here
├── ground-truth/           ← generated .png + .gt.txt line pairs (review these!)
├── models/                 ← output: labelnet.traineddata
├── scripts/prepare_ground_truth.py
├── colab_train_ocr.ipynb   ← one-click Google Colab training (recommended)
└── train_local.sh          ← local training with tesstrain (WSL/Linux/macOS)
```

**The short version:**

```bash
# 1 · Drop 10–50 label photos into training/images/
# 2 · Generate + review ground truth
pip install Pillow numpy
python training/scripts/prepare_ground_truth.py
#    ⚠️ manually fix every .gt.txt — errors here are taught to the model

# 3 · Train (either path)
#    A) Google Colab: upload training/colab_train_ocr.ipynb → Run all
#    B) Local: bash training/train_local.sh   (needs tesstrain)

# 4 · Deploy
cp training/models/labelnet.traineddata public/tessdata/
```

**Free data, forever:** every human correction made in the Review Queue can be
captured (opt-in, off by default, stored only on-device, 7-day expiry) as a
labeled image+text pair. Settings → **Export training ZIP** packages them in the
exact `tesstrain` layout — drop straight into `training/ground-truth/`.

Full walkthrough: [training/README.md](training/README.md)

---

## 🪶 Lite Mode (low-memory devices)

Settings → **Performance** → *Auto / On / Off*.

- **Auto** (default) activates only on constrained devices (`navigator.deviceMemory ≤ 2GB` or `≤ 2 CPU cores`); capable machines stay in full fidelity
- Trims: custom cursor rAF loop, animations/transitions, smooth scrolling, and — where it really matters — **OCR canvas size** (2000px → 900px, ~4–5× less peak canvas RAM) plus the AI-upload downscale

---

## ⌨️ Keyboard Shortcuts

| Keys | Action |
|---|---|
| `Alt + 1…7` | Jump to Dashboard / Scan / Review / History / Legal / AI Providers / Settings |
| `Alt + K` | Keyboard shortcuts cheat sheet |
| `Tab` | Skip link → *"Skip to main content"* |
| `↑ ↓` arrows | Navigate the sidebar |

---

## 📁 Project Structure

```
SIH-SIH26034/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/                 # register / login / logout / session
│   │   │   ├── scans/                # cross-device scan sync
│   │   │   ├── validate-api-key/     # provider key validation (SSRF-guarded)
│   │   │   └── vision-fallback/      # hybrid-mode cloud OCR (SSRF-guarded)
│   │   ├── globals.css               # design tokens + a11y + lite-mode CSS
│   │   ├── layout.tsx                # AuthProvider + theme
│   │   ├── not-found.tsx             # branded 404
│   │   └── page.tsx                  # auth gate + view routing
│   ├── components/
│   │   ├── app/                      # Dashboard, UploadScan, ReviewQueue,
│   │   │                             # ProductHistory, ProductAudit, Report,
│   │   │                             # AIProviders, Settings, AuthPanel, …
│   │   └── ui/                       # shadcn/radix primitives
│   └── lib/
│       ├── auth.tsx                  # session context (client)
│       ├── auth-crypto.ts            # PBKDF2 client verifier
│       ├── server/auth-store.ts      # scrypt + AES-GCM + Redis store
│       ├── compliance-rules.ts       # ⚖️ the rules engine
│       ├── ocr.ts                    # Tesseract pipeline + whitelisting
│       ├── scan-sync.ts              # device ↔ server merge
│       ├── training-samples.ts       # review corrections → tesstrain ZIP
│       ├── lite-mode.ts              # low-memory detection
│       └── local-data.ts             # scan persistence (localStorage)
├── training/                         # OCR fine-tuning pipeline (see above)
├── docs/                             # SETUP, ARCHITECTURE, OCR_TRAINING, …
└── public/tessdata/                  # WASM models incl. your fine-tuned one
```

---

## 📚 Documentation

| Doc | Contents |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Install, env vars, deployment target, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design deep-dive |
| [docs/OCR_TRAINING.md](docs/OCR_TRAINING.md) · [training/README.md](training/README.md) | Model fine-tuning pipeline |
| [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) | Provider presets & custom providers |
| [docs/OPENROUTER_GUARDRAILS.md](docs/OPENROUTER_GUARDRAILS.md) | SSRF protections & outbound-call safety |
| [docs/FEATURES.md](docs/FEATURES.md) | Complete feature list |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Contributing / extending the engine |

---

## 👤 Author

 **Smart India Hackathon 2026** — problem statement **SIH26034**,
Dept. of Consumer Affairs, Government of India.

<div align="center">

**[github.com/abhinavdatta](https://github.com/abhinavdatta)**

*Hackathon project — provided as-is, no warranty. Not legal advice; verify
compliance determinations against the official Rules text.*

</div>
