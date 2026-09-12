# Quick Setup Guide

## Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** (recommended: Node.js 20+)
- **Bun 1.3+** (recommended) or npm/pnpm/yarn
- Git (if cloning from repository)

## Installation Steps

### 1. Download Project

**Option A: From ZIP File**
```bash
# Extract the zip file
unzip lmcc-project-v2.zip
cd lmcc-project-v2
```

**Option B: From Git Repository**
```bash
git clone <repository-url>
cd lmcc-legal-metrology-compliance-checker
```

### 2. Install Dependencies

Using **Bun** (recommended):
```bash
bun install
```

Using **npm**:
```bash
npm install
```

Using **pnpm**:
```bash
pnpm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Note: AI provider API keys are configured via the UI after installation, not in `.env`.

### 4. Start Development Server

```bash
bun run dev
```

The application will be available at: `http://localhost:3000`

### 5. Verify Installation

1. Open `http://localhost:3000` in your browser
2. Navigate to **Dashboard** to see sample data
3. Try the **Demo Mode** in Scan Product to test OCR functionality
4. Check **AI Providers** in Settings to see available models

## First-Time Configuration

### Configure AI Providers (Optional)

1. Click **AI Providers** in the sidebar
2. Choose a provider (e.g., "Phi-3.5 Vision" for free NVIDIA)
3. Click "Configure API Key"
4. Enter your API key:
   - **For OpenRouter**: Get key from https://openrouter.ai/
   - **For NVIDIA**: Get key from https://build.nvidia.com/
5. Click "Validate Key" (optional, but recommended)
6. Click "Save API Key"
7. Enable the provider toggle

Don't know which provider to pick? Browse
[awesome-freellm-apis](https://github.com/open-free-llm-api/awesome-freellm-apis)
— a curated list of free LLM APIs and where to get keys. The custom-provider
forms also include a "Where do I find these?" help section and a
**Test connection** button that verifies your URL/model/key before saving.

### Choose OCR Mode

In the **Scan Product** view (Upload Mode):
- **Local Only** (default): No external data sent, fully offline
- **AI Mode**: Best accuracy, requires configured AI provider
- **Hybrid Mode**: Balance of speed and accuracy, recommended for production

## Build for Production

```bash
bun run build
bun run start
```

## Deployment Target: Vercel Hobby Plan

This project deploys on the **Vercel Hobby plan**, which hard-caps serverless
function execution at **10 seconds** — `maxDuration` cannot be raised above 10
on Hobby regardless of what the code requests.

Consequences baked into the code:

- Both API routes (`/api/validate-api-key`, `/api/vision-fallback`) declare
  `export const maxDuration = 10`.
- **API key validation** is deliberately cheap: `max_tokens: 1` with an 8s
  internal timeout, so the route finishes well inside the cap. The historic
  `Server error: 502` on validation was Vercel's gateway killing the function
  before its own 20s timeout fired; the shorter internal timeout fixes that.
- **Cloud vision OCR routinely exceeds 10s** (NVIDIA vision models measured at
  30–120s per label). On Hobby this will 502 for slow models no matter what the
  code does. Mitigations:
  - Prefer fast vision models (e.g. Llama 3.2 11B Vision) over 90B models.
  - Use **Local** OCR mode (fully offline, no function limits — Tesseract runs
    in your browser) when working with slow models.
  - If you upgrade to Vercel **Pro**, raise `maxDuration` to 60 in both route
    files and the internal timeouts (currently 8s validate / unbounded vision)
    can be raised to match.

## Finding Free LLM APIs & Keys

A community-maintained catalogue of free LLM API providers (with links to each
provider's key/signup page) lives at:

**https://github.com/open-free-llm-api/awesome-freellm-apis**

The app links to this list inside **AI Providers → Add Custom Provider →
"Where do I find these?"**.

## Troubleshooting

### Port Already in Use

If port 3000 is in use, kill the process or use a different port:

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 bun run dev
```

### Dependencies Issues

If you encounter dependency issues:

```bash
# Clear cache and reinstall
rm -rf node_modules bun.lock
bun install
```

### Build Errors

If build fails, try:

```bash
# Clear Next.js cache
rm -rf .next
bun run build
```

### OCR Not Working

1. Check browser console for errors
2. Ensure image format is supported (JPG, PNG, WEBP, GIF, BMP, HEIC, PDF)
3. Try a simpler image first
4. Check browser compatibility (Chrome, Firefox, Safari recommended)

### AI Validation Timeout

If API validation times out:

1. Use "Skip validation" checkbox and add API key directly
2. Check your internet connection
3. Verify API key format:
   - NVIDIA: Must start with `nvapi-`
   - OpenRouter: Must start with `sk-or-` or `sk-`
   - Custom providers: Any format accepted

## Development

### Lint Code
```bash
bun run lint
```

### Type Check
```bash
bun run tsc --noEmit
```

### Add New AI Provider

1. Edit `src/components/app/AIProvidersView.tsx`
2. Add to `DEFAULT_PROVIDERS` array
3. Configure API URL, model, description
4. Set tier ('free' or 'paid')
5. Add category ('openrouter' or 'nvidia')

## Support

For issues, questions, or contributions:
- Check README.md for detailed documentation
- Review DEVELOPER_GUIDE.md for implementation details
- Open an issue on GitHub with:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - Browser and OS information

## Uninstallation

```bash
# Stop the server (Ctrl+C)
# Remove project directory
cd ..
rm -rf lmcc-project-v2
```

All data is stored in your browser's localStorage, so uninstalling the application will not delete your scan history. To clear data:
1. Open Developer Tools (F12)
2. Go to Application tab
3. Expand Local Storage
4. Select `http://localhost:3000`
5. Clear all entries or specific keys:
   - `lmcc-scans` - Scan history
   - `lmcc-ai-providers` - AI provider configurations
   - `lmcc-cloud-ocr-enabled` - Cloud mode preference