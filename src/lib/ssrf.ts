// ═══════════════════════════════════════════════════════════════
// SSRF Guard — validates outbound request targets for API routes.
// Both /api/validate-api-key and /api/vision-fallback take an
// apiUrl from the client; without this check a malicious request
// could make the server fetch internal/metadata endpoints.
// ═══════════════════════════════════════════════════════════════

/** Hosts the app's built-in (preset) providers always use. */
export const BUILTIN_ALLOWED_HOSTS = [
  'openrouter.ai',
  'integrate.api.nvidia.com',
] as const;

/**
 * Extra operator-configured hosts (comma-separated). Set e.g.
 * API_HOST_ALLOWLIST=api.example.com,api.other.org to pin specific
 * custom providers. Bare hostnames; ports are ignored.
 */
function getEnvAllowlist(): string[] {
  const raw = process.env.API_HOST_ALLOWLIST ?? '';
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.svc') || // Kubernetes service names
    /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
    hostname === '0.0.0.0'
  );
}

/** IPv4 ranges that must never be fetched by the server (SSRF targets). */
function isPrivateIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return true; // Not a valid dotted quad — reject

  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true; // RFC1918 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 172.16/12
  if (a === 192 && b === 168) return true; // RFC1918 192.168/16
  if (a === 169 && b === 254) return true; // Link-local (incl. cloud metadata 169.254.169.254)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10 (some overlays)
  if (a === 0) return true; // "this network"
  if (a >= 224) return true; // Multicast + reserved
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  // Strip brackets from [::1]-style literals
  const host = hostname.replace(/^\[|\]$/g, '');
  if (!host.includes(':')) return false;
  const lower = host.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') || // fc00::/7 unique-local
    lower.startsWith('fd') ||
    lower.startsWith('fe80') // link-local
  );
}

/**
 * Result of validating a client-supplied API URL against the SSRF policy.
 * `reason` is safe to return to the client (no internal details leaked).
 */
export interface UrlValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate a client-supplied outbound API URL.
 *
 * Policy:
 * 1. Must parse as an absolute HTTP(S) URL.
 * 2. HTTPS is required (custom on-prem HTTP endpoints can be added to
 *    API_HOST_ALLOWLIST for deliberate local deployments).
 * 3. Hosts on the built-in list (or API_HOST_ALLOWLIST) always pass.
 * 4. Any other host (custom providers) must be public: no loopback,
 *    private, link-local, cloud-metadata, or raw-IP private ranges,
 *    and no IP-literal hosts other than public ones.
 */
export function validateOutboundApiUrl(rawUrl: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'apiUrl is not a valid absolute URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'apiUrl must use HTTPS.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { allowed: false, reason: 'apiUrl has no hostname.' };
  }

  // Built-in or operator-pinned hosts are always allowed.
  if (
    (BUILTIN_ALLOWED_HOSTS as readonly string[]).includes(hostname) ||
    getEnvAllowlist().includes(hostname)
  ) {
    return { allowed: true };
  }

  // Custom-provider hosts: must be public.
  if (isLoopbackHost(hostname)) {
    return { allowed: false, reason: 'apiUrl host is not permitted (loopback/local addresses are blocked).' };
  }
  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return { allowed: false, reason: 'apiUrl host is not permitted (private/internal IP addresses are blocked).' };
  }
  // Raw public IP literals are allowed (some self-hosted deployments use them),
  // but only after the private-range checks above.

  return { allowed: true };
}
