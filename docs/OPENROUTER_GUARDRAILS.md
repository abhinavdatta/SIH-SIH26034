# OpenRouter Guardrails Implementation Guide

This document provides comprehensive guardrails and security measures for implementing OpenRouter API integration in the LMCC application.

---

## Table of Contents

1. [Overview](#overview)
2. [API Key Security](#api-key-security)
3. [Request Guardrails](#request-guardrails)
4. [Response Guardrails](#response-guardrails)
5. [OpenRouter Platform Guardrails](#openrouter-platform-guardrails)
6. [Rate Limiting](#rate-limiting)
7. [Cost Controls](#cost-controls)
8. [Data Privacy](#data-privacy)
9. [Monitoring & Logging](#monitoring--logging)
10. [Implementation Checklist](#implementation-checklist)

---

## Overview

Guardrails are protective measures that ensure safe, secure, and cost-effective use of AI APIs. This guide covers both application-level guardrails and OpenRouter platform-level configurations.

### Why Guardrails Matter

- **Security**: Prevent API key leaks and unauthorized access
- **Cost Control**: Avoid unexpected charges from excessive usage
- **Reliability**: Handle errors gracefully and provide fallbacks
- **Privacy**: Protect sensitive data and comply with regulations
- **Quality**: Ensure AI responses meet expected standards

---

## API Key Security

### 1. Never Expose Keys Client-Side ✅

**Current Implementation (Secure)**:
```typescript
// Client-side sends key to proxy
const response = await fetch('/api/vision-fallback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image: base64Image,
    provider: { apiKey: 'sk-or-...' } // Sent to server only
  }),
});

// Server-side adds key to OpenRouter request
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  headers: {
    'Authorization': `Bearer ${apiKey}`, // Added server-side
  },
});
```

**❌ NEVER Do This**:
```typescript
// INSECURE - Key exposed in browser
fetch('https://openrouter.ai/api/v1/chat/completions', {
  headers: {
    'Authorization': `Bearer ${apiKey}`, // Visible in browser dev tools!
  },
});
```

### 2. Key Validation

**Current Implementation**:
```typescript
async function validateApiKey(apiKey: string, apiUrl: string, model: string): Promise<{ valid: boolean; error?: string }> {
  // Format check
  if (!apiKey.startsWith('sk-or-') && !apiKey.startsWith('sk-')) {
    return { valid: false, error: 'Invalid API key format' };
  }

  // API test
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 1,
    }),
  });

  if (response.status === 401) {
    return { valid: false, error: 'Invalid API key' };
  } else if (response.status === 402) {
    return { valid: false, error: 'Insufficient credits' };
  }

  return { valid: true };
}
```

### 3. Key Rotation Strategy

```typescript
// Implement key rotation for production
const API_KEYS = {
  primary: process.env.OPENROUTER_API_KEY_PRIMARY,
  secondary: process.env.OPENROUTER_API_KEY_SECONDARY,
};

async function getKeyWithFallback() {
  // Try primary key first
  const primaryValid = await validateApiKey(API_KEYS.primary);
  if (primaryValid.valid) return API_KEYS.primary;

  // Fallback to secondary key
  const secondaryValid = await validateApiKey(API_KEYS.secondary);
  if (secondaryValid.valid) return API_KEYS.secondary;

  throw new Error('No valid API keys available');
}
```

### 4. Key Storage Best Practices

- ✅ Store in environment variables for server-side use
- ✅ Store in localStorage for client-side user-entered keys
- ✅ Mask keys in UI (show only first 8 characters)
- ✅ Provide option to remove/reset keys
- ❌ Never hardcode keys in source code
- ❌ Never commit keys to version control
- ❌ Never log keys to console or files

---

## Request Guardrails

### 1. Input Validation

```typescript
// Validate image before sending to AI
function validateImageForOCR(imageFile: File): { valid: boolean; error?: string } {
  // Size limit (10MB)
  if (imageFile.size > 10 * 1024 * 1024) {
    return { valid: false, error: 'Image too large (max 10MB)' };
  }

  // File type validation
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
  if (!validTypes.includes(imageFile.type)) {
    return { valid: false, error: 'Invalid image type' };
  }

  // Resolution check (after loading)
  // Max 4000x4000 to prevent excessive token usage
  // Min 100x100 to prevent microscopic images

  return { valid: true };
}
```

### 2. Request Size Limits

```typescript
// Limit base64 image size
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB base64

function prepareImageForAPI(imageFile: File): string {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      if (base64.length > MAX_IMAGE_SIZE) {
        reject(new Error('Image too large for API processing'));
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(imageFile);
  });
}
```

### 3. Token Usage Control

```typescript
// Limit max tokens to control cost
const MAX_TOKENS = 4000; // Reasonable for OCR tasks

const openRouterRequest = {
  model,
  messages: [...],
  max_tokens: MAX_TOKENS, // Prevent runaway costs
  temperature: 0.1,      // Low temperature for consistent output
};
```

### 4. Timeout Protection

```typescript
// Add timeout to prevent hanging requests
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - AI service took too long to respond');
    }
    throw error;
  }
};

// Usage
const response = await fetchWithTimeout(apiUrl, requestOptions, 30000);
```

### 5. Retry Logic with Exponential Backoff

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, 30000);
      
      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on server errors (5xx)
      if (response.status >= 500) {
        if (attempt === maxRetries - 1) return response;
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }

  throw new Error('Max retries exceeded');
}
```

---

## Response Guardrails

### 1. Response Validation

```typescript
// Validate OCR result structure
interface OCRResult {
  productName: string | null;
  manufacturerName: string | null;
  fields: Array<{
    fieldName: string;
    value: string | null;
    confidence: number;
    sourceText: string;
  }>;
  rawText: string;
  overallConfidence: number;
}

function validateOCRResult(data: any): OCRResult | null {
  // Check top-level structure
  if (!data || typeof data !== 'object') return null;
  
  // Validate required fields
  if (typeof data.productName !== 'string' && data.productName !== null) return null;
  if (typeof data.manufacturerName !== 'string' && data.manufacturerName !== null) return null;
  if (!Array.isArray(data.fields)) return null;
  if (typeof data.rawText !== 'string') return null;

  // Validate fields array
  const validFields = data.fields.filter((f: any) => {
    if (!f || typeof f !== 'object') return false;
    if (typeof f.fieldName !== 'string') return false;
    if (typeof f.value !== 'string' && f.value !== null) return false;
    if (typeof f.confidence !== 'number') return false;
    if (f.confidence < 0 || f.confidence > 1) return false;
    if (typeof f.sourceText !== 'string') return false;
    return true;
  });

  if (validFields.length === 0) {
    console.warn('No valid fields in OCR result');
    return null;
  }

  return {
    productName: data.productName,
    manufacturerName: data.manufacturerName,
    fields: validFields,
    rawText: data.rawText,
    overallConfidence: validFields.reduce((sum, f) => sum + f.confidence, 0) / validFields.length,
  };
}
```

### 2. JSON Extraction Robustness

```typescript
// Extract JSON from potentially malformed AI response
function extractJSON(response: string): any | null {
  // Try to find JSON object in the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Try to clean up common JSON issues
    try {
      const cleaned = jsonMatch[0]
        .replace(/,\s*}/g, '}')     // Remove trailing commas
        .replace(/,\s*]/g, ']')     // Remove trailing commas in arrays
        .replace(/'/g, '"')         // Replace single quotes with double quotes
        .replace(/(\w+):/g, '"$1":'); // Add quotes to property names
      
      return JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse JSON:', jsonMatch[0]);
      return null;
    }
  }
}
```

### 3. Sanitization of Extracted Data

```typescript
// Sanitize extracted text to prevent injection attacks
function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

function sanitizeOCRResult(result: OCRResult): OCRResult {
  return {
    ...result,
    productName: result.productName ? sanitizeText(result.productName) : null,
    manufacturerName: result.manufacturerName ? sanitizeText(result.manufacturerName) : null,
    rawText: sanitizeText(result.rawText),
    fields: result.fields.map(field => ({
      ...field,
      value: field.value ? sanitizeText(field.value) : null,
      sourceText: sanitizeText(field.sourceText),
    })),
  };
}
```

### 4. Confidence Threshold Filtering

```typescript
// Filter out low-confidence extractions
const MIN_CONFIDENCE_THRESHOLD = 0.5;

function filterByConfidence(result: OCRResult, minConfidence: number = MIN_CONFIDENCE_THRESHOLD): OCRResult {
  return {
    ...result,
    fields: result.fields.filter(field => 
      field.confidence >= minConfidence || field.value === null
    ),
  };
}
```

---

## OpenRouter Platform Guardrails

### 1. OpenRouter Dashboard Settings

Navigate to [OpenRouter Dashboard](https://openrouter.ai/dashboard) to configure:

#### Rate Limiting
```
Settings → Rate Limits
- Set requests per minute: 60 (adjust based on your plan)
- Set requests per hour: 1000
- Enable: "Reject requests over limit"
```

#### Cost Alerts
```
Settings → Billing → Cost Alerts
- Set daily spending limit: $10.00
- Set monthly spending limit: $100.00
- Enable email notifications at 80% of limit
```

#### Model Restrictions
```
Settings → Model Access
- Allowed models: Select specific models only
- Blocked models: Block expensive models
- Enable: "Require approval for new models"
```

### 2. OpenRouter API Request Headers

```typescript
// Required headers for OpenRouter
const headers = {
  'Authorization': `Bearer ${apiKey}`,
  'HTTP-Referer': 'https://your-app.com',  // Your site URL
  'X-Title': 'Your App Name',              // Your app name
  'Content-Type': 'application/json',
};
```

**Why these headers?**
- `HTTP-Referer`: Helps OpenRouter track legitimate traffic
- `X-Title`: Improves model routing and debugging
- Both help with cost optimization and fraud detection

### 3. Model-Specific Configurations

```typescript
// Model configurations with guardrails
const MODEL_CONFIGS: Record<string, {
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
}> = {
  'openai/gpt-4o': {
    maxTokens: 4000,
    temperature: 0.1,
    timeoutMs: 30000,
    maxRetries: 3,
  },
  'anthropic/claude-3.5-sonnet': {
    maxTokens: 4000,
    temperature: 0.1,
    timeoutMs: 30000,
    maxRetries: 3,
  },
  'thinkingmachines/inkling:free': {
    maxTokens: 2000,  // Lower limit for free model
    temperature: 0.1,
    timeoutMs: 60000, // Free model may be slower
    maxRetries: 2,    // Fewer retries for free tier
  },
};
```

### 4. OpenRouter Webhooks (Optional)

Set up webhooks for monitoring:

```typescript
// Webhook endpoint to receive usage alerts
app.post('/api/openrouter-webhook', async (req, res) => {
  const { type, data } = req.body;

  switch (type) {
    case 'usage_limit':
      console.warn('Usage limit reached:', data);
      // Disable cloud OCR temporarily
      localStorage.setItem('cloud-ocr-temp-disabled', 'true');
      break;
    case 'cost_alert':
      console.warn('Cost alert:', data);
      // Notify admin
      break;
    case 'rate_limit':
      console.warn('Rate limit hit:', data);
      break;
  }

  res.status(200).json({ received: true });
});
```

---

## Rate Limiting

### 1. Client-Side Rate Limiting

```typescript
// Simple in-memory rate limiter
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(identifier: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) || [];
    
    // Remove old timestamps outside the window
    const recentTimestamps = timestamps.filter(t => now - t < this.windowMs);
    
    if (recentTimestamps.length >= this.maxRequests) {
      return false;
    }

    recentTimestamps.push(now);
    this.requests.set(identifier, recentTimestamps);
    return true;
  }

  getTimeUntilNextRequest(identifier: string): number {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) || [];
    const oldestInWindow = timestamps.find(t => now - t < this.windowMs);
    
    if (!oldestInWindow) return 0;
    return this.windowMs - (now - oldestInWindow);
  }
}

// Usage
const ocrRateLimiter = new RateLimiter(10, 60000); // 10 requests per minute

function canPerformOCR(userId: string): { allowed: boolean; waitTime?: number } {
  if (ocrRateLimiter.canMakeRequest(userId)) {
    return { allowed: true };
  }
  
  const waitTime = ocrRateLimiter.getTimeUntilNextRequest(userId);
  return { allowed: false, waitTime };
}
```

### 2. Server-Side Rate Limiting (Recommended)

```typescript
// Using next-rate-limit or similar middleware
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
});

export async function POST(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  // Process request...
}
```

---

## Cost Controls

### 1. Token Usage Tracking

```typescript
// Track token usage per user/session
interface TokenUsage {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
}

class TokenTracker {
  private usage: TokenUsage[] = [];
  private dailyLimit: number;

  constructor(dailyLimit: number) {
    this.dailyLimit = dailyLimit;
  }

  logUsage(userId: string, model: string, inputTokens: number, outputTokens: number) {
    const today = new Date().toDateString();
    const todayUsage = this.usage.filter(
      u => u.userId === userId && new Date(u.timestamp).toDateString() === today
    );

    const totalTokens = todayUsage.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);
    
    if (totalTokens + inputTokens + outputTokens > this.dailyLimit) {
      throw new Error('Daily token limit exceeded');
    }

    this.usage.push({
      userId,
      model,
      inputTokens,
      outputTokens,
      timestamp: Date.now(),
    });
  }

  getDailyUsage(userId: string): number {
    const today = new Date().toDateString();
    return this.usage
      .filter(u => u.userId === userId && new Date(u.timestamp).toDateString() === today)
      .reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);
  }
}
```

### 2. Cost Estimation

```typescript
// Approximate costs per 1M tokens (adjust based on current prices)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'anthropic/claude-3-opus': { input: 15.00, output: 75.00 },
  'google/gemini-pro-1.5': { input: 1.25, output: 5.00 },
  'deepseek/deepseek-vl2': { input: 0.14, output: 0.28 },
  'thinkingmachines/inkling:free': { input: 0, output: 0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;

  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;

  return inputCost + outputCost;
}

// Usage
const estimatedCost = estimateCost(
  'openai/gpt-4o',
  1000,  // input tokens
  500    // output tokens
);
console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
```

### 3. Budget Alerts

```typescript
// Check budget before making requests
async function checkBudgetBeforeRequest(userId: string, estimatedCost: number): Promise<boolean> {
  const monthlyBudget = 100.00; // $100 per month
  const currentSpend = await getCurrentMonthSpend(userId);

  if (currentSpend + estimatedCost > monthlyBudget) {
    // Notify user
    toast.warning('Budget Limit Approaching', {
      description: `You've used $${currentSpend.toFixed(2)} of your $${monthlyBudget} monthly budget.`,
    });
    return false;
  }

  return true;
}
```

---

## Data Privacy

### 1. Data Retention Policy

```typescript
// Don't store images or OCR results permanently
// Only store scan results in localStorage (client-side)

// Set automatic cleanup
const DATA_RETENTION_DAYS = 30;

function cleanupOldData() {
  const scans = getAllScans();
  const now = Date.now();
  const retentionMs = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const recentScans = scans.filter(scan => 
    now - new Date(scan.createdAt).getTime() < retentionMs
  );

  if (recentScans.length < scans.length) {
    localStorage.setItem('lmcc-scans', JSON.stringify(recentScans));
    console.log(`Cleaned up ${scans.length - recentScans.length} old scans`);
  }
}

// Run cleanup on app load
cleanupOldData();
```

### 2. Privacy Notice in UI

```tsx
<Alert>
  <ShieldAlert className="h-4 w-4" />
  <AlertTitle>Privacy Notice</AlertTitle>
  <AlertDescription>
    When using cloud OCR, your images are sent to the AI provider for processing.
    By enabling this feature, you agree to the provider's privacy policy and terms of service.
    Images are not stored permanently on our servers.
  </AlertDescription>
</Alert>
```

### 3. Anonymization Options

```typescript
// Option to anonymize data before sending to AI
function anonymizeForOCR(imageData: string): string {
  // Add watermark or overlay to obscure sensitive information
  // This is optional and should be user-controlled
  return imageData;
}
```

---

## Monitoring & Logging

### 1. Server-Side Logging

```typescript
// Log all API calls (server-side only, no sensitive data)
interface APILogEntry {
  timestamp: number;
  model: string;
  statusCode: number;
  responseTime: number;
  success: boolean;
  error?: string;
}

const apiLogs: APILogEntry[] = [];

function logAPICall(model: string, statusCode: number, responseTime: number, error?: string) {
  apiLogs.push({
    timestamp: Date.now(),
    model,
    statusCode,
    responseTime,
    success: statusCode >= 200 && statusCode < 300,
    error,
  });

  // Keep only last 1000 logs
  if (apiLogs.length > 1000) {
    apiLogs.shift();
  }
}

// Usage
const startTime = Date.now();
const response = await fetch(apiUrl, options);
const responseTime = Date.now() - startTime;
logAPICall(model, response.status, responseTime, response.ok ? undefined : 'Request failed');
```

### 2. Error Tracking

```typescript
// Track errors for debugging
interface ErrorEntry {
  timestamp: number;
  error: string;
  model: string;
  userId?: string;
  stack?: string;
}

const errorLog: ErrorEntry[] = [];

function logError(error: Error, model: string, userId?: string) {
  errorLog.push({
    timestamp: Date.now(),
    error: error.message,
    model,
    userId,
    stack: error.stack,
  });

  console.error('[OCR Error]', {
    error: error.message,
    model,
    timestamp: new Date().toISOString(),
  });
}
```

### 3. Analytics (Optional)

```typescript
// Track usage patterns (anonymized)
interface AnalyticsEvent {
  event: string;
  model: string;
  success: boolean;
  responseTime: number;
  timestamp: number;
}

function trackEvent(event: string, model: string, success: boolean, responseTime: number) {
  const analyticsEvent: AnalyticsEvent = {
    event,
    model,
    success,
    responseTime,
    timestamp: Date.now(),
  };

  // Send to analytics service (e.g., Google Analytics, Mixpanel)
  // Be sure to comply with privacy regulations
}
```

---

## Implementation Checklist

### Security
- [x] API keys never exposed client-side
- [x] API key validation before saving
- [x] Server-side proxy for all API calls
- [x] Request timeout protection
- [ ] API key rotation strategy (for production)
- [ ] Rate limiting per user
- [ ] Input validation and sanitization

### Cost Control
- [x] Max tokens limit (4000)
- [x] Low temperature (0.1) for consistency
- [ ] Token usage tracking
- [ ] Cost estimation before requests
- [ ] Budget alerts
- [ ] Daily/monthly spending limits

### Reliability
- [x] Automatic fallback to local OCR
- [x] Detailed error messages
- [ ] Retry logic with exponential backoff
- [ ] Graceful degradation
- [ ] User notifications for failures

### Privacy
- [x] Data retention policy (30 days)
- [x] Privacy notice in UI
- [x] No permanent server-side storage
- [ ] Data anonymization option
- [ ] GDPR compliance checklist

### Monitoring
- [x] Server-side logging
- [x] Error tracking
- [ ] Analytics integration
- [ ] Performance monitoring
- [ ] Alert system for critical issues

### OpenRouter Platform
- [ ] Configure rate limits in dashboard
- [ ] Set up cost alerts
- [ ] Restrict model access
- [ ] Enable webhooks (optional)
- [ ] Monitor usage dashboard

---

## Quick Start Guardrails Implementation

For immediate deployment, implement these 5 critical guardrails:

### 1. API Key Validation (✅ Already Implemented)
```typescript
// Validates key format and makes a test API call
async function validateApiKey(apiKey: string, apiUrl: string, model: string) {
  // Validation logic...
}
```

### 2. Request Timeout (✅ Already Implemented)
```typescript
const response = await fetchWithTimeout(apiUrl, options, 30000);
```

### 3. Automatic Fallback (✅ Already Implemented)
```typescript
try {
  ocrResult = await performCloudOCR(...);
} catch (error) {
  toast.error('Cloud OCR failed', { description: 'Using local OCR instead' });
  ocrResult = await performOCR(...); // Fallback
}
```

### 4. Response Validation (✅ Already Implemented)
```typescript
const validated = validateOCRResult(parsed);
if (!validated) {
  throw new Error('Invalid OCR result structure');
}
```

### 5. Detailed Error Messages (✅ Already Implemented)
```typescript
if (response.status === 401) {
  return { error: 'Invalid API key. Please check your API key in AI Providers settings.' };
} else if (response.status === 429) {
  return { error: 'Rate limit exceeded. Please try again later or upgrade your plan.' };
}
// ... more specific error handling
```

---

## Resources

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [OpenRouter Pricing](https://openrouter.ai/models)
- [OpenRouter Dashboard](https://openrouter.ai/dashboard)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

---

## Support

For questions about implementing these guardrails or OpenRouter integration, please refer to the main README.md or DEVELOPER_GUIDE.md files.
