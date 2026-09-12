/* ---------------------------------------------------------------------------
   AI Providers View — Configure VISION/OCR AI service providers
   All models listed here are vision-capable and optimized for OCR tasks
   Supports multiple AI models via OpenRouter and NVIDIA with tabbed interface
   --------------------------------------------------------------------------- */

'use client';

import { useState } from 'react';
import { Settings, Key, Globe, Check, AlertTriangle, Info, Trash2, Pencil, Plus, Loader2, Sparkles, Server, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { generateId } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/* ── Types ── */

export interface AIProvider {
  id: string;
  name: string;
  description: string;
  apiUrl: string;
  model: string;
  apiKey: string;
  isEnabled: boolean;
  isConfigured: boolean;
  requiresApiKey: boolean;
  tier: 'free' | 'paid';
  features: string[];
  category: 'openrouter' | 'nvidia' | 'custom';
}

/* ── Default Providers (VISION/OCR MODELS ONLY) ── */

const DEFAULT_PROVIDERS: Omit<AIProvider, 'apiKey' | 'isConfigured'>[] = [
  // ===== OPENROUTER VISION MODELS =====
  {
    id: 'openrouter-gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI\'s most capable multimodal model with vision capabilities',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'openrouter',
    features: [
      'Multimodal vision understanding',
      'Excellent OCR accuracy',
      'Best for complex layouts',
      'Handles multiple languages'
    ]
  },
  {
    id: 'openrouter-gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Faster, cheaper version of GPT-4o with good vision capabilities',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o-mini',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'openrouter',
    features: [
      'Fast response time',
      'Cost-effective',
      'Good OCR accuracy',
      'Multimodal support'
    ]
  },
  {
    id: 'openrouter-claude-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic\'s balanced model with strong vision and reasoning',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-3.5-sonnet',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'openrouter',
    features: [
      'Excellent text understanding',
      'Strong vision capabilities',
      'Great for structured extraction',
      'Natural language understanding'
    ]
  },
  {
    id: 'openrouter-claude-opus',
    name: 'Claude 3 Opus',
    description: 'Anthropic\'s most capable model for complex vision tasks',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-3-opus',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'openrouter',
    features: [
      'Highest accuracy',
      'Complex reasoning',
      'Advanced vision',
      'Detailed extraction'
    ]
  },
  {
    id: 'openrouter-gemini-pro',
    name: 'Gemini Pro Vision',
    description: 'Google\'s multimodal model with strong image understanding',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemini-pro-1.5',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'openrouter',
    features: [
      'Google\'s vision model',
      'Multilingual support',
      'Good OCR accuracy',
      'Fast processing'
    ]
  },
  {
    id: 'openrouter-deepseek-vl',
    name: 'DeepSeek VL',
    description: 'Cost-effective vision model with good OCR capabilities',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-vl2',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'openrouter',
    features: [
      'Cost-effective',
      'Good vision understanding',
      'Fast processing',
      'Chinese & English text'
    ]
  },
  {
    id: 'thinking-machines-inkling',
    name: 'Thinking Machines: Inkling',
    description: 'Vision-capable AI model for enhanced OCR accuracy via OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'thinkingmachines/inkling:free',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'free',
    category: 'openrouter',
    features: [
      'Free to use',
      'Vision/image understanding',
      'Enhanced text extraction',
      'Better handling of complex layouts'
    ]
  },
  {
    id: 'openrouter-qwen-vl',
    name: 'Qwen VL',
    description: 'Alibaba\'s vision-language model with strong multilingual OCR',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'qwen/qwen-2-vl-7b-instruct:free',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'free',
    category: 'openrouter',
    features: [
      'Free tier available',
      'Multilingual OCR',
      'Good accuracy',
      'Fast response'
    ]
  },
  // ===== CUSTOM MODEL (USER CONFIGURABLE) =====
  {
    id: 'custom-openrouter',
    name: 'Custom OpenRouter Model',
    description: 'Use any VISION-CAPABLE OpenRouter model by specifying the model ID',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'openrouter',
    features: [
      'Use any vision-capable OpenRouter model',
      'Fully customizable',
      'Access to latest vision models',
      'Flexible configuration'
    ]
  },
  // ===== NVIDIA NIM VISION MODELS =====
  // Model IDs verified live against integrate.api.nvidia.com on 2026-09-11:
  // - qwen/qwen-2-vl-7b-instruct no longer exists (404) — removed
  // - microsoft/phi-3.5-vision-instruct no longer exists — replaced by phi-3-vision-128k
  // - moonshotai/kimi-k3 exists but is TEXT-ONLY (hangs on image input) — removed
  {
    id: 'nvidia-llama-3.2-vision',
    name: 'Llama 3.2 Vision',
    description: 'Meta\'s Llama 3.2 11B with vision capabilities via NVIDIA NIM — fastest NVIDIA vision model',
    apiUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: 'meta/llama-3.2-11b-vision-instruct',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'free',
    category: 'nvidia',
    features: [
      'Free tier available',
      'Open source model',
      'Verified working for label OCR',
      '~30-50s per label scan'
    ]
  },
  {
    id: 'nvidia-llama-3.2-90b-vision',
    name: 'Llama 3.2 90B Vision',
    description: 'Meta\'s largest Llama 3.2 vision model — highest accuracy, but slow (may exceed 2 minutes per label)',
    apiUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: 'meta/llama-3.2-90b-vision-instruct',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'paid',
    category: 'nvidia',
    features: [
      'Highest vision accuracy',
      'Best for complex label layouts',
      'Very slow (2+ minutes per scan)',
      'Use 11B model for quick scans'
    ]
  },
  {
    id: 'nvidia-phi-3-vision',
    name: 'Phi-3 Vision',
    description: 'Microsoft\'s efficient vision model (128k context) for OCR tasks',
    apiUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: 'microsoft/phi-3-vision-128k-instruct',
    isEnabled: false,
    requiresApiKey: true,
    tier: 'free',
    category: 'nvidia',
    features: [
      'Free to use',
      'Compact and efficient',
      'Good OCR accuracy',
      'Fast inference'
    ]
  },
];

/* ── Storage Keys ── */

const STORAGE_KEY = 'lmcc-ai-providers';
const CLOUD_MODE_KEY = 'lmcc-cloud-ocr-enabled';

/* ── Main Component ── */

export default function AIProvidersView() {
  // Initialize providers from localStorage
  const [providers, setProviders] = useState<AIProvider[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Drop providers whose model IDs are confirmed dead (404 on NVIDIA) so
      // old localStorage data doesn't keep broken defaults around.
      const DEAD_PROVIDER_IDS = new Set(['nvidia-qwen-vl', 'nvidia-kimi-k3']);
      const alive = parsed.filter((p: AIProvider) => !DEAD_PROVIDER_IDS.has(p.id));
      const existingIds = new Set(alive.map((p: AIProvider) => p.id));
      const newProviders = DEFAULT_PROVIDERS.filter(p => !existingIds.has(p.id));
      const merged = [...alive, ...newProviders];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
    const initialized = DEFAULT_PROVIDERS.map(p => ({
      ...p,
      apiKey: '',
      isConfigured: false
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialized));
    return initialized;
  });

  const [cloudModeEnabled, setCloudModeEnabled] = useState(() => {
    return localStorage.getItem(CLOUD_MODE_KEY) === 'true';
  });

  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [skipValidation, setSkipValidation] = useState(false);
  const [activeTab, setActiveTab] = useState('openrouter');

  // Custom provider form states
  const [showCustomProviderForm, setShowCustomProviderForm] = useState(false);
  const [customProviderName, setCustomProviderName] = useState('');
  const [customProviderUrl, setCustomProviderUrl] = useState('');
  const [customProviderModel, setCustomProviderModel] = useState('');
  const [customProviderApiKey, setCustomProviderApiKey] = useState('');
  const [customProviderCategory, setCustomProviderCategory] = useState<'openrouter' | 'nvidia'>('openrouter');
  const [showCustomHelp, setShowCustomHelp] = useState(false);

  // Test-connection state for the custom-provider ADD form
  const [isTestingCustom, setIsTestingCustom] = useState(false);
  const [customTestResult, setCustomTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Custom provider EDIT dialog state (dedicated dialog — preset "Configure"
  // dialog is intentionally untouched)
  const [editingCustomProviderId, setEditingCustomProviderId] = useState<string | null>(null);
  const [editProviderName, setEditProviderName] = useState('');
  const [editProviderUrl, setEditProviderUrl] = useState('');
  const [editProviderModel, setEditProviderModel] = useState('');
  const [editProviderKey, setEditProviderKey] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isValidatingEdit, setIsValidatingEdit] = useState(false);
  const [editValidationError, setEditValidationError] = useState<string | null>(null);

  const saveProviders = (updatedProviders: AIProvider[]) => {
    setProviders(updatedProviders);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProviders));
  };

  const handleToggleCloudMode = (enabled: boolean) => {
    setCloudModeEnabled(enabled);
    localStorage.setItem(CLOUD_MODE_KEY, enabled.toString());

    if (enabled) {
      const configuredProvider = providers.find(p => p.isEnabled && p.isConfigured);
      if (!configuredProvider) {
        toast.warning('Cloud mode enabled', {
          description: 'Please configure and enable an AI provider with an API key for enhanced accuracy.'
        });
      } else {
        toast.success('Cloud mode enabled', {
          description: `Using ${configuredProvider.name} for enhanced OCR accuracy.`
        });
      }
    } else {
      toast.info('Cloud mode disabled', {
        description: 'All OCR processing will be done locally with Tesseract.js.'
      });
    }
  };

  const handleConfigureProvider = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      setEditingProvider(providerId);
      setApiKeyInput(provider.apiKey || '');
      setCustomModelInput(provider.model || '');
      setValidationError(null);
    }
  };

  const handleValidateApiKey = async () => {
    if (!editingProvider || !apiKeyInput.trim()) return;

    const provider = providers.find(p => p.id === editingProvider);
    if (!provider) return;

    setIsValidating(true);
    setValidationError(null);

    try {
      // Add timeout for client-side fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout (longer than server's 30s)

      const response = await fetch('/api/validate-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKeyInput,
          apiUrl: provider.apiUrl,
          model: customModelInput || provider.model,
          category: provider.category,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check response status and content type before parsing JSON
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `Server error: ${response.status}`;

        if (contentType?.includes('application/json')) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await response.text();
          if (text && !text.startsWith('<!DOCTYPE')) {
            errorMessage = text.substring(0, 200);
          }
        }

        setIsValidating(false);
        setValidationError(errorMessage);
        toast.error('Validation Failed', {
          description: errorMessage
        });
        return;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await response.text();
        const errorMessage = `Server returned non-JSON response: ${text.substring(0, 100)}`;
        setIsValidating(false);
        setValidationError(errorMessage);
        toast.error('Validation Failed', {
          description: errorMessage
        });
        return;
      }

      const data = await response.json();

      setIsValidating(false);

      if (!data.valid) {
        setValidationError(data.error || 'Validation failed');
        toast.error('API Key Validation Failed', {
          description: data.error || 'Please check your API key and try again.'
        });
      } else {
        toast.success('API Key Valid', {
          description: data.message || 'Your API key is working correctly.'
        });
      }
    } catch (error: unknown) {
      setIsValidating(false);

      // Handle specific error types
      let errorMessage = 'Network error. Please check your internet connection.';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. The API provider may be slow or unreachable. Please try again.';
        } else {
          errorMessage = error.message;
        }
      }

      setValidationError(errorMessage);
      toast.error('Validation Failed', {
        description: errorMessage
      });
    }
  };

  const handleSaveApiKey = async () => {
    if (!editingProvider) return;

    setIsSaving(true);
    setValidationError(null);

    // Skip validation if user chose to skip
    if (!skipValidation) {
      try {
        // Add timeout for client-side fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

        const response = await fetch('/api/validate-api-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey: apiKeyInput,
            apiUrl: providers.find(p => p.id === editingProvider)!.apiUrl,
            model: customModelInput || providers.find(p => p.id === editingProvider)!.model,
            category: providers.find(p => p.id === editingProvider)!.category,
            skipExternalTest: false,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Check response status and content type before parsing JSON
        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorMessage = `Server error: ${response.status}`;

          if (contentType?.includes('application/json')) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            errorMessage = errorData.error || errorMessage;
          } else {
            const text = await response.text();
            if (text && !text.startsWith('<!DOCTYPE')) {
              errorMessage = text.substring(0, 200);
            }
          }

          setIsSaving(false);
          setValidationError(errorMessage);
          toast.error('Invalid API Key', {
            description: errorMessage
          });
          return;
        }

        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          const text = await response.text();
          const errorMessage = `Server returned non-JSON response: ${text.substring(0, 100)}`;
          setIsSaving(false);
          setValidationError(errorMessage);
          toast.error('Invalid API Key', {
            description: errorMessage
          });
          return;
        }

        const data = await response.json();

        if (!data.valid) {
          setIsSaving(false);
          setValidationError(data.error || 'Validation failed');
          toast.error('Invalid API Key', {
            description: data.error || 'Please check your API key and try again.'
          });
          return;
        }
      } catch (error: unknown) {
        setIsSaving(false);

        // Handle specific error types
        let errorMessage = 'Network error. Please check your internet connection.';

        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. The API provider may be slow or unreachable. Please try again.';
          } else {
            errorMessage = error.message;
          }
        }

        setValidationError(errorMessage);
        toast.error('Validation Failed', {
          description: errorMessage
        });
        return;
      }
    }

    const updated = providers.map(p => {
      if (p.id === editingProvider) {
        const hasKey = apiKeyInput.trim().length > 0;
        return {
          ...p,
          apiKey: apiKeyInput.trim(),
          model: customModelInput || p.model,
          isConfigured: hasKey,
          isEnabled: hasKey
        };
      }
      return p;
    });

    saveProviders(updated);
    setEditingProvider(null);
    setApiKeyInput('');
    setCustomModelInput('');
    setIsSaving(false);

    toast.success('API Key Saved', {
      description: 'Provider configured and validated successfully.'
    });
  };

  const handleDeleteApiKey = (providerId: string) => {
    const updated = providers.map(p => {
      if (p.id === providerId) {
        return {
          ...p,
          apiKey: '',
          isConfigured: false,
          isEnabled: false
        };
      }
      return p;
    });

    saveProviders(updated);
    toast.info('API Key Removed', {
      description: 'Provider reset to unconfigured state.'
    });
  };

  const handleToggleProvider = (providerId: string, enabled: boolean) => {
    const updated = providers.map(p => {
      if (p.id === providerId) {
        if (enabled && !p.isConfigured) {
          toast.error('Provider Not Configured', {
            description: 'Please add and validate an API key first.'
          });
          return p;
        }
        return { ...p, isEnabled: enabled };
      }
      // Disable other providers when enabling one (single provider mode)
      if (enabled && p.id !== providerId) {
        return { ...p, isEnabled: false };
      }
      return p;
    });

    saveProviders(updated);
  };

  const handleAddCustomProvider = async () => {
    if (!customProviderName.trim() || !customProviderUrl.trim() || !customProviderModel.trim()) {
      toast.error('Missing Information', {
        description: 'Please fill in all required fields: Name, API URL, and Model.'
      });
      return;
    }

    // Validate URL format
    try {
      new URL(customProviderUrl);
    } catch {
      toast.error('Invalid URL', {
        description: 'Please enter a valid API URL (e.g., https://api.example.com/v1/chat/completions).'
      });
      return;
    }

    const customProviderId = `custom-${customProviderCategory}-${generateId()}`;

    const newProvider: AIProvider = {
      id: customProviderId,
      name: customProviderName.trim(),
      description: `Custom ${customProviderCategory === 'openrouter' ? 'OpenRouter-compatible' : 'NVIDIA-compatible'} provider`,
      apiUrl: customProviderUrl.trim(),
      model: customProviderModel.trim(),
      apiKey: customProviderApiKey.trim(),
      isEnabled: false,
      isConfigured: !!customProviderApiKey.trim(),
      requiresApiKey: true,
      tier: 'paid',
      category: customProviderCategory,
      features: [
        'Custom configuration',
        'Flexible model selection',
        'Private deployment support'
      ]
    };

    const updated = [...providers, newProvider];
    saveProviders(updated);

    // Reset form
    resetCustomForm();
    setShowCustomProviderForm(false);

    toast.success('Custom Provider Added', {
      description: `"${customProviderName}" has been added to your providers.`
    });
  };

  /**
   * Shared connection test for the custom ADD form and the EDIT dialog.
   * Posts to /api/validate-api-key exactly like the preset provider flow.
   * Returns the server's validity + error message for inline display.
   */
  const testProviderConnection = async (
    apiUrl: string,
    model: string,
    apiKey: string,
    category: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!apiKey.trim()) {
      return { ok: false, message: 'Enter an API key first — validation needs a key to test.' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch('/api/validate-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiUrl, model, category }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `Server error: ${response.status}`;
        if (contentType?.includes('application/json')) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await response.text();
          if (text && !text.startsWith('<!DOCTYPE')) errorMessage = text.substring(0, 200);
        }
        return { ok: false, message: errorMessage };
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return { ok: false, message: 'Server returned a non-JSON response. Is the dev server running?' };
      }

      const data = await response.json();
      if (!data.valid) {
        return { ok: false, message: data.error || 'Validation failed' };
      }
      return { ok: true, message: data.message || 'API key is valid and working' };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, message: 'Request timed out. The API provider may be slow or unreachable.' };
      }
      return { ok: false, message: error instanceof Error ? error.message : 'Network error' };
    }
  };

  const handleTestCustomConnection = async () => {
    if (!customProviderUrl.trim() || !customProviderModel.trim()) {
      setCustomTestResult({ ok: false, message: 'Fill in the API URL and Model ID before testing.' });
      return;
    }
    setIsTestingCustom(true);
    setCustomTestResult(null);
    const result = await testProviderConnection(
      customProviderUrl.trim(),
      customProviderModel.trim(),
      customProviderApiKey,
      customProviderCategory
    );
    setIsTestingCustom(false);
    setCustomTestResult(result);
    if (result.ok) {
      toast.success('Connection works', { description: result.message });
    } else {
      toast.error('Connection failed', { description: result.message });
    }
  };

  const resetCustomForm = () => {
    setCustomProviderName('');
    setCustomProviderUrl('');
    setCustomProviderModel('');
    setCustomProviderApiKey('');
    setCustomTestResult(null);
    setShowCustomHelp(false);
  };

  const handleOpenEditCustomProvider = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    setEditingCustomProviderId(providerId);
    setEditProviderName(provider.name);
    setEditProviderUrl(provider.apiUrl);
    setEditProviderModel(provider.model);
    setEditProviderKey(provider.apiKey || '');
    setEditValidationError(null);
  };

  const handleCloseEditCustomProvider = () => {
    setEditingCustomProviderId(null);
    setEditProviderName('');
    setEditProviderUrl('');
    setEditProviderModel('');
    setEditProviderKey('');
    setEditValidationError(null);
  };

  const handleValidateEditProvider = async () => {
    const provider = providers.find(p => p.id === editingCustomProviderId);
    if (!provider) return;
    setIsValidatingEdit(true);
    setEditValidationError(null);
    const result = await testProviderConnection(
      editProviderUrl.trim(),
      editProviderModel.trim(),
      editProviderKey,
      provider.category
    );
    setIsValidatingEdit(false);
    if (result.ok) {
      toast.success('API Key Valid', { description: result.message });
    } else {
      setEditValidationError(result.message);
      toast.error('Validation Failed', { description: result.message });
    }
  };

  /**
   * Save an edited custom provider IN PLACE: same ID, same position in the
   * list, all other fields (tier, features, category...) preserved via
   * spread. Only name/URL/model/key (and derived flags) change.
   */
  const handleSaveEditCustomProvider = async () => {
    if (!editingCustomProviderId) return;

    if (!editProviderName.trim() || !editProviderUrl.trim() || !editProviderModel.trim()) {
      setEditValidationError('Name, API URL, and Model ID are all required.');
      return;
    }

    try {
      new URL(editProviderUrl.trim());
    } catch {
      setEditValidationError('Invalid API URL — use a full https:// URL.');
      return;
    }

    setIsSavingEdit(true);
    setEditValidationError(null);

    const hasKey = editProviderKey.trim().length > 0;
    const updated = providers.map(p => {
      if (p.id !== editingCustomProviderId) return p;
      return {
        ...p, // preserve id, category, tier, features, position
        name: editProviderName.trim(),
        apiUrl: editProviderUrl.trim(),
        model: editProviderModel.trim(),
        apiKey: editProviderKey.trim(),
        isConfigured: hasKey,
        isEnabled: hasKey ? p.isEnabled : false,
      };
    });

    saveProviders(updated);
    setIsSavingEdit(false);
    handleCloseEditCustomProvider();

    toast.success('Provider Updated', {
      description: `"${editProviderName.trim()}" was updated in place.`
    });
  };

  const handleDeleteCustomProvider = (providerId: string) => {
    if (!providerId.startsWith('custom-')) {
      toast.error('Cannot Delete', {
        description: 'Only custom providers can be deleted.'
      });
      return;
    }

    const updated = providers.filter(p => p.id !== providerId);
    saveProviders(updated);

    toast.info('Provider Deleted', {
      description: 'Custom provider has been removed.'
    });
  };

  // Group providers by category
  const openRouterProviders = providers.filter(p => p.category === 'openrouter');
  const nvidiaProviders = providers.filter(p => p.category === 'nvidia');
  const customOpenRouterProviders = openRouterProviders.filter(p => p.id.startsWith('custom-'));
  const customNvidiaProviders = nvidiaProviders.filter(p => p.id.startsWith('custom-'));
  const defaultOpenRouterProviders = openRouterProviders.filter(p => !p.id.startsWith('custom-'));
  const defaultNvidiaProviders = nvidiaProviders.filter(p => !p.id.startsWith('custom-'));

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-static p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
        >
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            AI Providers Configuration
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Configure AI services for enhanced OCR accuracy
          </p>
        </div>
      </div>

      {/* Cloud Mode Toggle */}
      <Card className="card-static">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-base">Use Enhanced Cloud Accuracy</CardTitle>
              <CardDescription className="text-xs mt-1">
                Enable AI-powered OCR for improved extraction accuracy
              </CardDescription>
            </div>
            <Switch
              checked={cloudModeEnabled}
              onCheckedChange={handleToggleCloudMode}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
            <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
            <div className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                This mode sends your uploaded images to an external AI service for processing.
              </p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Requires an active internet connection</li>
                <li>Requires a valid API key from selected provider</li>
                <li>Images may be logged and used to improve the AI models</li>
                <li>Not fully offline — disable for complete local processing</li>
              </ul>
            </div>
          </div>

          {cloudModeEnabled && !providers.some(p => p.isEnabled && p.isConfigured) && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="text-xs">
                <p className="font-medium text-red-900 dark:text-red-100">
                  No configured AI provider
                </p>
                <p className="text-red-700 dark:text-red-300 mt-0.5">
                  Configure and validate a provider below to use cloud accuracy mode.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider Tabs */}
      <Tabs defaultValue="openrouter" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
          <TabsTrigger value="openrouter" className="gap-2">
            <Server className="h-4 w-4" />
            OpenRouter
          </TabsTrigger>
          <TabsTrigger value="nvidia" className="gap-2">
            <Zap className="h-4 w-4" />
            NVIDIA
          </TabsTrigger>
        </TabsList>

        {/* OpenRouter Tab */}
        <TabsContent value="openrouter" className="mt-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              OpenRouter Models
            </h3>
            <Badge variant="outline" className="text-[10px]">
              {openRouterProviders.length} available
            </Badge>
          </div>

          {/* Default OpenRouter Providers */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            {defaultOpenRouterProviders.map((provider) => (
              <Card key={provider.id} className="card-static">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle className="text-base truncate">{provider.name}</CardTitle>
                        <Badge
                          variant="outline"
                          className={provider.tier === 'free' ? 'text-green-600 border-green-200' : 'text-blue-600 border-blue-200'}
                        >
                          {provider.tier === 'free' ? 'Free' : 'Paid'}
                        </Badge>
                        {provider.isEnabled && provider.isConfigured && (
                          <Badge className="bg-green-600 text-white">
                            <Check className="h-2.5 w-2.5 mr-1" /> Active
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs truncate">
                        {provider.description}
                      </CardDescription>
                    </div>

                    <Switch
                      checked={provider.isEnabled}
                      onCheckedChange={(enabled) => handleToggleProvider(provider.id, enabled)}
                      disabled={!provider.isConfigured}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Features */}
                  <div className="flex flex-wrap gap-2">
                    {provider.features.map((feature, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px]">
                        {feature}
                      </Badge>
                    ))}
                  </div>

                  {/* Configuration */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Key className="h-4 w-4 shrink-0" style={{ color: provider.isConfigured ? 'var(--success)' : 'var(--text-muted)' }} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {provider.isConfigured ? 'API Key Configured' : 'API Key Required'}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {provider.model}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {provider.isConfigured ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey(provider.id)}
                          className="text-xs h-8"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      ) : (
                        <Dialog
                          open={editingProvider === provider.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingProvider(null);
                              setApiKeyInput('');
                              setCustomModelInput('');
                              setValidationError(null);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfigureProvider(provider.id)}
                              className="text-xs h-8"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add API Key
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Configure {provider.name}</DialogTitle>
                              <DialogDescription>
                                Enter your OpenRouter API key to enable this provider.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="api-key">OpenRouter API Key</Label>
                                <Input
                                  id="api-key"
                                  type="password"
                                  placeholder="sk-or-..."
                                  value={apiKeyInput}
                                  onChange={(e) => {
                                    setApiKeyInput(e.target.value);
                                    setValidationError(null);
                                  }}
                                  disabled={isSaving || isValidating}
                                />
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  Get your API key from{' '}
                                  <a
                                    href="https://openrouter.ai/keys"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                    style={{ color: 'var(--primary)' }}
                                  >
                                    openrouter.ai/keys
                                  </a>{' '}
                                  — or browse free providers in{' '}
                                  <a
                                    href="https://github.com/open-free-llm-api/awesome-freellm-apis"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                    style={{ color: 'var(--primary)' }}
                                  >
                                    awesome-freellm-apis
                                  </a>
                                </p>
                                {validationError && (
                                  <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                                    {validationError}
                                  </p>
                                )}
                              </div>

                              {/* Model ID is editable for EVERY provider so users can
                                  switch to newer model IDs when providers retire old
                                  ones (e.g. NVIDIA silently removing qwen-2-vl). */}
                              <div className="space-y-2">
                                <Label htmlFor="custom-model">Model ID</Label>
                                <Input
                                  id="custom-model"
                                  type="text"
                                  placeholder="e.g., openai/gpt-4o"
                                  value={customModelInput}
                                  onChange={(e) => setCustomModelInput(e.target.value)}
                                  disabled={isSaving || isValidating}
                                />
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  Must be vision-capable for image OCR. See{' '}
                                  <a
                                    href="https://openrouter.ai/models"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                    style={{ color: 'var(--primary)' }}
                                  >
                                    available models
                                  </a>
                                </p>
                              </div>

                              <div className="flex items-start gap-2 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                                <Globe className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                                <div className="text-xs space-y-1">
                                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                    API Endpoint
                                  </p>
                                  <p className="font-mono text-[10px] break-all" style={{ color: 'var(--text-muted)' }}>
                                    {provider.apiUrl}
                                  </p>
                                  <p className="font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
                                    Model
                                  </p>
                                  <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {customModelInput || provider.model}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <DialogFooter className="flex-col sm:flex-row gap-2">
                              <div className="flex items-center space-x-2 mb-2 sm:mb-0 w-full sm:w-auto">
                                <Checkbox
                                  id="skip-validation-openrouter"
                                  checked={skipValidation}
                                  onCheckedChange={(checked) => setSkipValidation(checked === true)}
                                />
                                <Label
                                  htmlFor="skip-validation-openrouter"
                                  className="text-sm cursor-pointer flex items-center gap-1"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  Skip validation
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs">Skip API validation if you&apos;re experiencing network issues. Use at your own risk.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </Label>
                              </div>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setEditingProvider(null);
                                  setApiKeyInput('');
                                  setCustomModelInput('');
                                  setValidationError(null);
                                  setSkipValidation(false);
                                }}
                                disabled={isSaving || isValidating}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="outline"
                                onClick={handleValidateApiKey}
                                disabled={!apiKeyInput.trim() || isSaving || isValidating || skipValidation}
                              >
                                {isValidating ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Validating...
                                  </>
                                ) : (
                                  'Validate Key'
                                )}
                              </Button>
                              <Button
                                onClick={handleSaveApiKey}
                                disabled={!apiKeyInput.trim() || isSaving || isValidating}
                              >
                                {isSaving ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving...
                                  </>
                                ) : (
                                  skipValidation ? 'Save (Skip Validation)' : 'Save API Key'
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Custom OpenRouter Providers Section */}
          {customOpenRouterProviders.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Custom OpenRouter Providers
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {customOpenRouterProviders.length} configured
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                {customOpenRouterProviders.map((provider) => (
                  <Card key={provider.id} className="card-static border-2" style={{ borderColor: 'var(--primary-light)' }}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <CardTitle className="text-base truncate">{provider.name}</CardTitle>
                            <Badge variant="outline" className="text-purple-600 border-purple-200">
                              Custom
                            </Badge>
                            {provider.isEnabled && provider.isConfigured && (
                              <Badge className="bg-green-600 text-white">
                                <Check className="h-2.5 w-2.5 mr-1" /> Active
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-xs truncate">
                            {provider.description}
                          </CardDescription>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditCustomProvider(provider.id)}
                            className="text-xs h-8"
                            aria-label={`Edit ${provider.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCustomProvider(provider.id)}
                            className="text-xs h-8 text-red-600 hover:text-red-700"
                            aria-label={`Delete ${provider.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Switch
                            checked={provider.isEnabled}
                            onCheckedChange={(enabled) => handleToggleProvider(provider.id, enabled)}
                            disabled={!provider.isConfigured}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Features */}
                      <div className="flex flex-wrap gap-2">
                        {provider.features.map((feature, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px]">
                            {feature}
                          </Badge>
                        ))}
                      </div>

                      {/* Configuration */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Key className="h-4 w-4 shrink-0" style={{ color: provider.isConfigured ? 'var(--success)' : 'var(--text-muted)' }} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                              {provider.isConfigured ? 'API Key Configured' : 'API Key Required'}
                            </p>
                            <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                              {provider.model}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {provider.isConfigured ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteApiKey(provider.id)}
                              className="text-xs h-8"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Key
                            </Button>
                          ) : (
                            <Dialog
                              open={editingProvider === provider.id}
                              onOpenChange={(open) => {
                                if (!open) {
                                  setEditingProvider(null);
                                  setApiKeyInput('');
                                  setCustomModelInput('');
                                  setValidationError(null);
                                  setSkipValidation(false);
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button size="sm" onClick={() => handleConfigureProvider(provider.id)}>
                                  <Key className="h-3.5 w-3.5 mr-1" /> Configure API Key
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle className="text-base">Configure {provider.name}</DialogTitle>
                                  <DialogDescription className="text-xs">
                                    Enter your API key to use this provider for OCR. Your API key is stored locally in your browser.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="api-key-custom-or" className="text-sm">API Key</Label>
                                    <Input
                                      id="api-key-custom-or"
                                      type="password"
                                      placeholder="Enter your API key"
                                      value={apiKeyInput}
                                      onChange={(e) => setApiKeyInput(e.target.value)}
                                      className="text-sm"
                                    />
                                    {validationError && (
                                      <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-[10px]">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                        <span>{validationError}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-start gap-2 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                                    <Globe className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                                    <div className="text-xs space-y-1">
                                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                        API Endpoint
                                      </p>
                                      <p className="font-mono text-[10px] break-all" style={{ color: 'var(--text-muted)' }}>
                                        {provider.apiUrl}
                                      </p>
                                      <p className="font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
                                        Model
                                      </p>
                                      <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        {provider.model}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <DialogFooter className="flex-col sm:flex-row gap-2">
                                  <div className="flex items-center space-x-2 mb-2 sm:mb-0 w-full sm:w-auto">
                                    <Checkbox
                                      id="skip-validation-custom-or"
                                      checked={skipValidation}
                                      onCheckedChange={(checked) => setSkipValidation(checked === true)}
                                    />
                                    <Label
                                      htmlFor="skip-validation-custom-or"
                                      className="text-sm cursor-pointer flex items-center gap-1"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      Skip validation
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            <p className="text-xs">Skip API validation if you&apos;re experiencing network issues. Use at your own risk.</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </Label>
                                  </div>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setEditingProvider(null);
                                      setApiKeyInput('');
                                      setCustomModelInput('');
                                      setValidationError(null);
                                      setSkipValidation(false);
                                    }}
                                    disabled={isSaving || isValidating}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={handleValidateApiKey}
                                    disabled={!apiKeyInput.trim() || isSaving || isValidating || skipValidation}
                                  >
                                    {isValidating ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Validating...
                                      </>
                                    ) : (
                                      'Validate Key'
                                    )}
                                  </Button>
                                  <Button
                                    onClick={handleSaveApiKey}
                                    disabled={!apiKeyInput.trim() || isSaving || isValidating}
                                  >
                                    {isSaving ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving...
                                      </>
                                    ) : (
                                      skipValidation ? 'Save (Skip Validation)' : 'Save API Key'
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add Custom Provider Button for OpenRouter */}
          <Card className="card-static border-2 border-dashed" style={{ borderColor: 'var(--border-hover)' }}>
            <CardContent className="p-6">
              <Dialog open={showCustomProviderForm} onOpenChange={setShowCustomProviderForm}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full h-full flex-col gap-2 py-6"
                    onClick={() => {
                      setCustomProviderCategory('openrouter');
                    }}
                  >
                    <Plus className="h-6 w-6" style={{ color: 'var(--primary)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Add Custom OpenRouter Provider
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Connect to any OpenRouter-compatible API
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-base">Add Custom OpenRouter Provider</DialogTitle>
                    <DialogDescription className="text-xs">
                      Configure a custom OpenRouter-compatible API endpoint for OCR.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-name-or" className="text-sm">Provider Name *</Label>
                      <Input
                        id="custom-provider-name-or"
                        placeholder="e.g., My Custom OpenRouter"
                        value={customProviderName}
                        onChange={(e) => setCustomProviderName(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-url-or" className="text-sm">API URL *</Label>
                      <Input
                        id="custom-provider-url-or"
                        placeholder="https://api.openrouter.ai/v1/chat/completions"
                        value={customProviderUrl}
                        onChange={(e) => setCustomProviderUrl(e.target.value)}
                        className="text-sm font-mono"
                      />
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        The chat-completions endpoint your provider documents — usually ends in{' '}
                        <code>/v1/chat/completions</code> or <code>/chat/completions</code>. Check your provider&apos;s API reference page.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-model-or" className="text-sm">Model ID *</Label>
                      <Input
                        id="custom-provider-model-or"
                        placeholder="e.g., openai/gpt-4o"
                        value={customProviderModel}
                        onChange={(e) => setCustomProviderModel(e.target.value)}
                        className="text-sm font-mono"
                      />
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        The exact model identifier from your provider&apos;s model list/catalog page — copy it exactly,
                        including any suffix like <code>:free</code>.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-key-or" className="text-sm">API Key (Optional)</Label>
                      <Input
                        id="custom-provider-key-or"
                        type="password"
                        placeholder="Enter your API key"
                        value={customProviderApiKey}
                        onChange={(e) => setCustomProviderApiKey(e.target.value)}
                        className="text-sm"
                      />
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Get keys from your provider&apos;s dashboard — see{' '}
                        <a
                          href="https://github.com/open-free-llm-api/awesome-freellm-apis"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                          style={{ color: 'var(--primary)' }}
                        >
                          awesome-freellm-apis
                        </a>{' '}
                        for free providers. You can add the key later if needed.
                      </p>
                    </div>

                    {/* Where do I find these? — concrete, non-abstract guidance */}
                    <div className="rounded-md border" style={{ borderColor: 'var(--border-light)' }}>
                      <button
                        type="button"
                        onClick={() => setShowCustomHelp(prev => !prev)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium cursor-pointer"
                        style={{ color: 'var(--text-primary)' }}
                        aria-expanded={showCustomHelp}
                      >
                        Where do I find these?
                        <span style={{ color: 'var(--text-muted)' }}>{showCustomHelp ? '−' : '+'}</span>
                      </button>
                      {showCustomHelp && (
                        <div className="px-3 pb-3 text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
                          <p>
                            <strong>Model ID:</strong> browse your provider&apos;s model catalog, e.g.{' '}
                            <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>openrouter.ai/models</a>,
                            and copy the identifier exactly (e.g. <code>meta/llama-3.2-11b-vision-instruct</code>).
                          </p>
                          <p>
                            <strong>API Key:</strong> create it in your provider&apos;s dashboard under &quot;API Keys&quot;, e.g.{' '}
                            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>openrouter.ai/keys</a>{' '}
                            or{' '}<a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>build.nvidia.com</a>.
                          </p>
                          <p>
                            <strong>API URL:</strong> shown on the provider&apos;s API-reference / &quot;Quickstart&quot; page — it is the same URL
                            their curl examples POST to.
                          </p>
                          <p>
                            <strong>Picking a provider:</strong> the{' '}
                            <a
                              href="https://github.com/open-free-llm-api/awesome-freellm-apis"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                              style={{ color: 'var(--primary)' }}
                            >
                              awesome-freellm-apis list
                            </a>{' '}
                            catalogues free LLM APIs and links to each one&apos;s key/signup page.
                          </p>
                          <p style={{ color: 'var(--text-muted)' }}>
                            Note: the model must be vision-capable (it needs to accept images) for OCR scans.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Test connection — catch mistakes at entry time */}
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleTestCustomConnection}
                        disabled={isTestingCustom || !customProviderUrl.trim() || !customProviderModel.trim() || !customProviderApiKey.trim()}
                      >
                        {isTestingCustom ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Testing...
                          </>
                        ) : (
                          'Test connection'
                        )}
                      </Button>
                      {!customProviderApiKey.trim() && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          Enter an API key to test — the test sends a tiny request to the provider with your key.
                        </p>
                      )}
                      {customTestResult && (
                        <div
                          className={`flex items-start gap-2 text-[10px] p-2 rounded-md ${customTestResult.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                          style={{ background: 'var(--bg-secondary)' }}
                        >
                          {customTestResult.ok
                            ? <Check className="h-3 w-3 mt-0.5 shrink-0" />
                            : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                          <span>{customTestResult.ok ? '✓ ' : ''}{customTestResult.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCustomProviderForm(false);
                        resetCustomForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleAddCustomProvider}>
                      Add Provider
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NVIDIA Tab */}
        <TabsContent value="nvidia" className="mt-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              NVIDIA NIM Models
            </h3>
            <Badge variant="outline" className="text-[10px]">
              {nvidiaProviders.length} available
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            {defaultNvidiaProviders.map((provider) => (
              <Card key={provider.id} className="card-static">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle className="text-base truncate">{provider.name}</CardTitle>
                        <Badge
                          variant="outline"
                          className={provider.tier === 'free' ? 'text-green-600 border-green-200' : 'text-blue-600 border-blue-200'}
                        >
                          {provider.tier === 'free' ? 'Free' : 'Paid'}
                        </Badge>
                        {provider.isEnabled && provider.isConfigured && (
                          <Badge className="bg-green-600 text-white">
                            <Check className="h-2.5 w-2.5 mr-1" /> Active
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs truncate">
                        {provider.description}
                      </CardDescription>
                    </div>

                    <Switch
                      checked={provider.isEnabled}
                      onCheckedChange={(enabled) => handleToggleProvider(provider.id, enabled)}
                      disabled={!provider.isConfigured}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Features */}
                  <div className="flex flex-wrap gap-2">
                    {provider.features.map((feature, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px]">
                        {feature}
                      </Badge>
                    ))}
                  </div>

                  {/* Configuration */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Key className="h-4 w-4 shrink-0" style={{ color: provider.isConfigured ? 'var(--success)' : 'var(--text-muted)' }} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {provider.isConfigured ? 'API Key Configured' : 'NVIDIA API Key Required'}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {provider.model}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {provider.isConfigured ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteApiKey(provider.id)}
                          className="text-xs h-8"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      ) : (
                        <Dialog
                          open={editingProvider === provider.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditingProvider(null);
                              setApiKeyInput('');
                              setCustomModelInput('');
                              setValidationError(null);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfigureProvider(provider.id)}
                              className="text-xs h-8"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add API Key
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Configure {provider.name}</DialogTitle>
                              <DialogDescription>
                                Enter your NVIDIA API key to enable this provider.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="api-key">NVIDIA API Key</Label>
                                <Input
                                  id="api-key"
                                  type="password"
                                  placeholder="nvapi-..."
                                  value={apiKeyInput}
                                  onChange={(e) => {
                                    setApiKeyInput(e.target.value);
                                    setValidationError(null);
                                  }}
                                  disabled={isSaving || isValidating}
                                />
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  Get your API key from{' '}
                                  <a
                                    href="https://build.nvidia.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                    style={{ color: 'var(--primary)' }}
                                  >
                                    build.nvidia.com
                                  </a>{' '}
                                  — or browse free providers in{' '}
                                  <a
                                    href="https://github.com/open-free-llm-api/awesome-freellm-apis"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                    style={{ color: 'var(--primary)' }}
                                  >
                                    awesome-freellm-apis
                                  </a>
                                </p>
                                {validationError && (
                                  <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                                    {validationError}
                                  </p>
                                )}
                              </div>

                              {/* Model ID editable: NVIDIA retires model IDs without
                                  notice (qwen-2-vl and phi-3.5-vision both went 404). */}
                              <div className="space-y-2">
                                <Label htmlFor="nvidia-model">Model ID</Label>
                                <Input
                                  id="nvidia-model"
                                  type="text"
                                  placeholder="e.g., meta/llama-3.2-11b-vision-instruct"
                                  value={customModelInput}
                                  onChange={(e) => setCustomModelInput(e.target.value)}
                                  disabled={isSaving || isValidating}
                                />
                                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  Must be a vision-capable NIM model (see build.nvidia.com).
                                </p>
                              </div>

                              <div className="flex items-start gap-2 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                                <Globe className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                                <div className="text-xs space-y-1">
                                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                    API Endpoint
                                  </p>
                                  <p className="font-mono text-[10px] break-all" style={{ color: 'var(--text-muted)' }}>
                                    {provider.apiUrl}
                                  </p>
                                  <p className="font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
                                    Model
                                  </p>
                                  <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {provider.model}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <DialogFooter className="flex-col sm:flex-row gap-2">
                              <div className="flex items-center space-x-2 mb-2 sm:mb-0 w-full sm:w-auto">
                                <Checkbox
                                  id="skip-validation-nvidia"
                                  checked={skipValidation}
                                  onCheckedChange={(checked) => setSkipValidation(checked === true)}
                                />
                                <Label
                                  htmlFor="skip-validation-nvidia"
                                  className="text-sm cursor-pointer flex items-center gap-1"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  Skip validation
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs">Skip API validation if you&apos;re experiencing network issues. Use at your own risk.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </Label>
                              </div>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setEditingProvider(null);
                                  setApiKeyInput('');
                                  setCustomModelInput('');
                                  setValidationError(null);
                                  setSkipValidation(false);
                                }}
                                disabled={isSaving || isValidating}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="outline"
                                onClick={handleValidateApiKey}
                                disabled={!apiKeyInput.trim() || isSaving || isValidating || skipValidation}
                              >
                                {isValidating ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Validating...
                                  </>
                                ) : (
                                  'Validate Key'
                                )}
                              </Button>
                              <Button
                                onClick={handleSaveApiKey}
                                disabled={!apiKeyInput.trim() || isSaving || isValidating}
                              >
                                {isSaving ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving...
                                  </>
                                ) : (
                                  skipValidation ? 'Save (Skip Validation)' : 'Save API Key'
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Custom NVIDIA Providers Section */}
          {customNvidiaProviders.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Custom NVIDIA Providers
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {customNvidiaProviders.length} configured
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                {customNvidiaProviders.map((provider) => (
                  <Card key={provider.id} className="card-static border-2" style={{ borderColor: 'var(--primary-light)' }}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <CardTitle className="text-base truncate">{provider.name}</CardTitle>
                            <Badge variant="outline" className="text-purple-600 border-purple-200">
                              Custom
                            </Badge>
                            {provider.isEnabled && provider.isConfigured && (
                              <Badge className="bg-green-600 text-white">
                                <Check className="h-2.5 w-2.5 mr-1" /> Active
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-xs truncate">
                            {provider.description}
                          </CardDescription>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditCustomProvider(provider.id)}
                            className="text-xs h-8"
                            aria-label={`Edit ${provider.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCustomProvider(provider.id)}
                            className="text-xs h-8 text-red-600 hover:text-red-700"
                            aria-label={`Delete ${provider.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Switch
                            checked={provider.isEnabled}
                            onCheckedChange={(enabled) => handleToggleProvider(provider.id, enabled)}
                            disabled={!provider.isConfigured}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Features */}
                      <div className="flex flex-wrap gap-2">
                        {provider.features.map((feature, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px]">
                            {feature}
                          </Badge>
                        ))}
                      </div>

                      {/* Configuration */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Key className="h-4 w-4 shrink-0" style={{ color: provider.isConfigured ? 'var(--success)' : 'var(--text-muted)' }} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                              {provider.isConfigured ? 'API Key Configured' : 'API Key Required'}
                            </p>
                            <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                              {provider.model}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {provider.isConfigured ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteApiKey(provider.id)}
                              className="text-xs h-8"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Key
                            </Button>
                          ) : (
                            <Dialog
                              open={editingProvider === provider.id}
                              onOpenChange={(open) => {
                                if (!open) {
                                  setEditingProvider(null);
                                  setApiKeyInput('');
                                  setCustomModelInput('');
                                  setValidationError(null);
                                  setSkipValidation(false);
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button size="sm" onClick={() => handleConfigureProvider(provider.id)}>
                                  <Key className="h-3.5 w-3.5 mr-1" /> Configure API Key
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle className="text-base">Configure {provider.name}</DialogTitle>
                                  <DialogDescription className="text-xs">
                                    Enter your API key to use this provider for OCR. Your API key is stored locally in your browser.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="api-key-custom-nv" className="text-sm">API Key</Label>
                                    <Input
                                      id="api-key-custom-nv"
                                      type="password"
                                      placeholder="Enter your API key"
                                      value={apiKeyInput}
                                      onChange={(e) => setApiKeyInput(e.target.value)}
                                      className="text-sm"
                                    />
                                    {validationError && (
                                      <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-[10px]">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                        <span>{validationError}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-start gap-2 p-3 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                                    <Globe className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                                    <div className="text-xs space-y-1">
                                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                        API Endpoint
                                      </p>
                                      <p className="font-mono text-[10px] break-all" style={{ color: 'var(--text-muted)' }}>
                                        {provider.apiUrl}
                                      </p>
                                      <p className="font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
                                        Model
                                      </p>
                                      <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        {provider.model}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <DialogFooter className="flex-col sm:flex-row gap-2">
                                  <div className="flex items-center space-x-2 mb-2 sm:mb-0 w-full sm:w-auto">
                                    <Checkbox
                                      id="skip-validation-custom-nv"
                                      checked={skipValidation}
                                      onCheckedChange={(checked) => setSkipValidation(checked === true)}
                                    />
                                    <Label
                                      htmlFor="skip-validation-custom-nv"
                                      className="text-sm cursor-pointer flex items-center gap-1"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      Skip validation
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            <p className="text-xs">Skip API validation if you&apos;re experiencing network issues. Use at your own risk.</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </Label>
                                  </div>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setEditingProvider(null);
                                      setApiKeyInput('');
                                      setCustomModelInput('');
                                      setValidationError(null);
                                      setSkipValidation(false);
                                    }}
                                    disabled={isSaving || isValidating}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={handleValidateApiKey}
                                    disabled={!apiKeyInput.trim() || isSaving || isValidating || skipValidation}
                                  >
                                    {isValidating ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Validating...
                                      </>
                                    ) : (
                                      'Validate Key'
                                    )}
                                  </Button>
                                  <Button
                                    onClick={handleSaveApiKey}
                                    disabled={!apiKeyInput.trim() || isSaving || isValidating}
                                  >
                                    {isSaving ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving...
                                      </>
                                    ) : (
                                      skipValidation ? 'Save (Skip Validation)' : 'Save API Key'
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add Custom Provider Button for NVIDIA */}
          <Card className="card-static border-2 border-dashed" style={{ borderColor: 'var(--border-hover)' }}>
            <CardContent className="p-6">
              <Dialog open={showCustomProviderForm} onOpenChange={setShowCustomProviderForm}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full h-full flex-col gap-2 py-6"
                    onClick={() => {
                      setCustomProviderCategory('nvidia');
                    }}
                  >
                    <Plus className="h-6 w-6" style={{ color: 'var(--primary)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Add Custom NVIDIA Provider
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Connect to any NVIDIA-compatible API
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-base">Add Custom NVIDIA Provider</DialogTitle>
                    <DialogDescription className="text-xs">
                      Configure a custom NVIDIA-compatible API endpoint for OCR.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-name-nv" className="text-sm">Provider Name *</Label>
                      <Input
                        id="custom-provider-name-nv"
                        placeholder="e.g., My Custom NVIDIA"
                        value={customProviderName}
                        onChange={(e) => setCustomProviderName(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-url-nv" className="text-sm">API URL *</Label>
                      <Input
                        id="custom-provider-url-nv"
                        placeholder="https://integrate.api.nvidia.com/v1/chat/completions"
                        value={customProviderUrl}
                        onChange={(e) => setCustomProviderUrl(e.target.value)}
                        className="text-sm font-mono"
                      />
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        The chat-completions endpoint your provider documents — usually ends in{' '}
                        <code>/v1/chat/completions</code> or <code>/chat/completions</code>. Check your provider&apos;s API reference page.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-model-nv" className="text-sm">Model ID *</Label>
                      <Input
                        id="custom-provider-model-nv"
                        placeholder="e.g., meta/llama-3.2-11b-vision-instruct"
                        value={customProviderModel}
                        onChange={(e) => setCustomProviderModel(e.target.value)}
                        className="text-sm font-mono"
                      />
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        The exact model identifier from your provider&apos;s model list/catalog page — copy it exactly,
                        including any suffix like <code>:free</code>.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-provider-key-nv" className="text-sm">API Key (Optional)</Label>
                      <Input
                        id="custom-provider-key-nv"
                        type="password"
                        placeholder="Enter your API key"
                        value={customProviderApiKey}
                        onChange={(e) => setCustomProviderApiKey(e.target.value)}
                        className="text-sm"
                      />
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Get keys from your provider&apos;s dashboard — see{' '}
                        <a
                          href="https://github.com/open-free-llm-api/awesome-freellm-apis"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                          style={{ color: 'var(--primary)' }}
                        >
                          awesome-freellm-apis
                        </a>{' '}
                        for free providers. You can add the key later if needed.
                      </p>
                    </div>

                    {/* Where do I find these? — concrete, non-abstract guidance (shared with OR form) */}
                    <div className="rounded-md border" style={{ borderColor: 'var(--border-light)' }}>
                      <button
                        type="button"
                        onClick={() => setShowCustomHelp(prev => !prev)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium cursor-pointer"
                        style={{ color: 'var(--text-primary)' }}
                        aria-expanded={showCustomHelp}
                      >
                        Where do I find these?
                        <span style={{ color: 'var(--text-muted)' }}>{showCustomHelp ? '−' : '+'}</span>
                      </button>
                      {showCustomHelp && (
                        <div className="px-3 pb-3 text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
                          <p>
                            <strong>Model ID:</strong> browse your provider&apos;s model catalog, e.g.{' '}
                            <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>openrouter.ai/models</a>{' '}
                            or <a href="https://build.nvidia.com/models" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>build.nvidia.com/models</a>,
                            and copy the identifier exactly (e.g. <code>meta/llama-3.2-11b-vision-instruct</code>).
                          </p>
                          <p>
                            <strong>API Key:</strong> create it in your provider&apos;s dashboard under &quot;API Keys&quot;, e.g.{' '}
                            <a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>build.nvidia.com</a>{' '}
                            or <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--primary)' }}>openrouter.ai/keys</a>.
                          </p>
                          <p>
                            <strong>API URL:</strong> shown on the provider&apos;s API-reference / &quot;Quickstart&quot; page — it is the same URL
                            their curl examples POST to.
                          </p>
                          <p>
                            <strong>Picking a provider:</strong> the{' '}
                            <a
                              href="https://github.com/open-free-llm-api/awesome-freellm-apis"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                              style={{ color: 'var(--primary)' }}
                            >
                              awesome-freellm-apis list
                            </a>{' '}
                            catalogues free LLM APIs and links to each one&apos;s key/signup page.
                          </p>
                          <p style={{ color: 'var(--text-muted)' }}>
                            Note: the model must be vision-capable (it needs to accept images) for OCR scans.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Test connection — catch mistakes at entry time (shared with OR form) */}
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleTestCustomConnection}
                        disabled={isTestingCustom || !customProviderUrl.trim() || !customProviderModel.trim() || !customProviderApiKey.trim()}
                      >
                        {isTestingCustom ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Testing...
                          </>
                        ) : (
                          'Test connection'
                        )}
                      </Button>
                      {!customProviderApiKey.trim() && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          Enter an API key to test — the test sends a tiny request to the provider with your key.
                        </p>
                      )}
                      {customTestResult && (
                        <div
                          className={`flex items-start gap-2 text-[10px] p-2 rounded-md ${customTestResult.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                          style={{ background: 'var(--bg-secondary)' }}
                        >
                          {customTestResult.ok
                            ? <Check className="h-3 w-3 mt-0.5 shrink-0" />
                            : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                          <span>{customTestResult.ok ? '✓ ' : ''}{customTestResult.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCustomProviderForm(false);
                        resetCustomForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleAddCustomProvider}>
                      Add Provider
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Custom Provider Dialog — dedicated (preset Configure dialog untouched).
          Pre-filled with the provider's current name, URL, model, and key; saving
          updates the record in place (same ID, same list position). */}
      <Dialog
        open={editingCustomProviderId !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseEditCustomProvider();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Custom Provider</DialogTitle>
            <DialogDescription className="text-xs">
              Update the provider details. Changes are saved in place — the provider keeps its position
              and ID. Your API key is stored locally in your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-provider-name" className="text-sm">Provider Name *</Label>
              <Input
                id="edit-provider-name"
                placeholder="e.g., My Custom Provider"
                value={editProviderName}
                onChange={(e) => setEditProviderName(e.target.value)}
                className="text-sm"
                disabled={isSavingEdit || isValidatingEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-provider-url" className="text-sm">API URL *</Label>
              <Input
                id="edit-provider-url"
                placeholder="https://provider.example.com/v1/chat/completions"
                value={editProviderUrl}
                onChange={(e) => setEditProviderUrl(e.target.value)}
                className="text-sm font-mono"
                disabled={isSavingEdit || isValidatingEdit}
              />
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                The chat-completions endpoint from your provider&apos;s API reference — usually ends in{' '}
                <code>/v1/chat/completions</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-provider-model" className="text-sm">Model ID *</Label>
              <Input
                id="edit-provider-model"
                placeholder="e.g., meta/llama-3.2-11b-vision-instruct"
                value={editProviderModel}
                onChange={(e) => setEditProviderModel(e.target.value)}
                className="text-sm font-mono"
                disabled={isSavingEdit || isValidatingEdit}
              />
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Copy the identifier exactly from your provider&apos;s model catalog, including suffixes like <code>:free</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-provider-key" className="text-sm">API Key</Label>
              <Input
                id="edit-provider-key"
                type="password"
                placeholder={editProviderKey ? '•••••••• (saved — type to replace)' : 'Enter your API key'}
                value={editProviderKey}
                onChange={(e) => setEditProviderKey(e.target.value)}
                className="text-sm"
                disabled={isSavingEdit || isValidatingEdit}
              />
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Get keys from your provider&apos;s dashboard — see{' '}
                <a
                  href="https://github.com/open-free-llm-api/awesome-freellm-apis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: 'var(--primary)' }}
                >
                  awesome-freellm-apis
                </a>
              </p>
            </div>

            {editValidationError && (
              <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-[11px] p-2 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{editValidationError}</span>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleCloseEditCustomProvider}
              disabled={isSavingEdit || isValidatingEdit}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleValidateEditProvider}
              disabled={!editProviderUrl.trim() || !editProviderModel.trim() || !editProviderKey.trim() || isSavingEdit || isValidatingEdit}
            >
              {isValidatingEdit ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Validating...
                </>
              ) : (
                'Validate Key'
              )}
            </Button>
            <Button onClick={handleSaveEditCustomProvider} disabled={isSavingEdit || isValidatingEdit}>
              {isSavingEdit ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Banner */}
      <Card className="card-static">
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
            <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                About AI-Enhanced OCR
              </p>
              <p>
                AI providers can significantly improve OCR accuracy on complex labels with multiple sections,
                colored backgrounds, or difficult layouts. However, they require internet access and send your
                images to external services. The default Tesseract.js OCR runs entirely locally and offline.
              </p>
              <p className="mt-2">
                <strong>Security:</strong> Your API key is stored locally in your browser and never sent to our servers.
                It is only sent directly to the AI provider when processing images.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Export Utilities ── */

/**
 * Get the currently active AI provider configuration
 */
export function getActiveAIProvider(): AIProvider | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const providers: AIProvider[] = JSON.parse(stored);
    return providers.find(p => p.isEnabled && p.isConfigured) || null;
  } catch {
    return null;
  }
}

/**
 * Check if cloud OCR mode is enabled
 */
export function isCloudOCREnabled(): boolean {
  try {
    return localStorage.getItem(CLOUD_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}
