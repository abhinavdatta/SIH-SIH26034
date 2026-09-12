# Changelog

All notable changes to LMCC - Legal Metrology Compliance Checker.

## [v2.0.0] - January 2025

### Added

#### OCR System
- **Hybrid OCR Mode**: Combines local Tesseract.js with cloud AI for optimal performance
- **Local Only OCR Mode**: Client-side only, no external data transmission
- **AI Mode**: Cloud AI only for best accuracy
- **Spatial Proximity Extraction**: Word-level bounding box matching for field extraction
- **SPATIAL_KEYWORDS**: Keyword matching with Indian language variants (Hindi included)
- **WordBox Interface**: Structured word extraction with bounding boxes
- **OCR Mode Selector**: RadioGroup component for easy mode selection
- **Smart Field Merging**: Prioritizes cloud results when local confidence < 0.65

#### AI Providers
- **Custom AI Providers**: Add unlimited custom OpenRouter/NVIDIA-compatible providers
- **NVIDIA NIM Models**: Added 4 NVIDIA vision models (Kimi K3, Phi-3.5 Vision, Llama 3.2 Vision, Qwen VL)
- **Skip Validation**: Option to skip API key validation for network-restricted environments
- **Provider Management**: Delete custom providers, view configuration details
- **Flexible Validation**: Custom providers skip strict API key format requirements

#### Error Handling
- **JSON Parsing Fix**: Handles malformed JSON responses gracefully
- **Enhanced Error Messages**: Detailed error extraction from API responses
- **Timeout Handling**: 45-second client-side timeout for validation requests
- **Network Error Detection**: Clear error messages for connectivity issues

### Changed

#### UI/UX
- **Improved Dialog Design**: Fixed transparency issues, solid backgrounds
- **Fixed Sidebar**: Hamburger menu properly hidden on desktop (≥1024px)
- **Responsive Layout**: Mobile-first design improvements
- **Visual Feedback**: Better indicators for disabled states and configurations
- **Progress Indicators**: Mode-specific progress steps and messages

#### API
- **Validation Timeout**: Increased from 10s to 30s for server-side requests
- **Error Response Handling**: Better JSON/text parsing for error messages
- **Format Validation**: More lenient for custom providers
- **AbortController**: Proper timeout handling for fetch requests

### Fixed

- **Scan Section Output**: Fixed demo mode not producing results
- **Runtime Errors**: Fixed `Cannot read properties of undefined (reading 'length')` in DashboardView
- **API Validation JSON**: Fixed JSON parsing errors in API validation endpoint
- **Dialog Background**: Fixed transparent dialog backgrounds in AI Provider configuration
- **Sidebar Duplicate**: Fixed hamburger menu appearing on desktop viewports
- **Module Import**: Fixed path resolution issues with local-data.ts

### Dependencies Added
- `axios` - For NVIDIA API integration

---

## [v1.0.0] - Initial Release

### Features
- Region-aware OCR using Tesseract.js
- Edge detection and region segmentation
- QR code and barcode exclusion
- Table-aware processing for nutrition panels
- Multi-format support (JPG, PNG, WEBP, GIF, BMP, HEIC, PDF)
- AI-enhanced OCR via Thinking Machines Lab's Inkling model
- Compliance checking against Legal Metrology Rules, 2011
- Review queue based on confidence scores
- PDF export, CSV export
- 100% client-side data storage
- Offline capable (core OCR)
- Responsive design

### Technology
- Next.js 16.1.3 with App Router and Turbopack
- TypeScript 5
- React 19
- Tailwind CSS 4
- shadcn/ui component library
- Zustand for state management
- Tesseract.js 5.1.1 for OCR
- OpenRouter API for AI OCR

---

## [Version Schema]

We use [Semantic Versioning](https://semver.org/) for versioning:
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes and minor improvements