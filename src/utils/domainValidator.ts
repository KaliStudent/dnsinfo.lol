// Domain validation utility

// Valid TLDs (subset of most common ones)
const COMMON_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'co', 'io', 'ai', 'app', 'dev', 'xyz', 'info', 'biz',
  'us', 'uk', 'ca', 'au', 'de', 'fr', 'es', 'it', 'nl',
  'jp', 'kr', 'cn', 'in', 'br', 'ru', 'mx', 'pl', 'se',
  'ch', 'at', 'be', 'dk', 'no', 'fi', 'ie', 'nz', 'za',
  'tv', 'me', 'cc', 'ws', 'bz', 'fm', 'la', 'ly', 'so',
  'club', 'online', 'site', 'store', 'blog', 'tech',
  'cloud', 'design', 'space', 'world', 'email', 'life',
  'solutions', 'systems', 'network', 'company', 'digital'
]);

export interface DomainValidationResult {
  isValid: boolean;
  domain: string;
  tld: string;
  sld: string;
  subdomain?: string;
  errors: string[];
}

export function validateDomain(input: string | string[] | undefined): DomainValidationResult {
  const errors: string[] = [];
  
  // Handle array input (take first element)
  const rawInput = Array.isArray(input) ? input[0] : input;
  
  // Check if undefined or empty
  if (!rawInput) {
    return {
      isValid: false,
      domain: '',
      tld: '',
      sld: '',
      errors: ['Domain name is required']
    };
  }
  
  // Clean the input
  let domain = rawInput
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '') // Remove protocol
    .replace(/^www\./, '')       // Remove www
    .split('/')[0]               // Remove path
    .split('?')[0]               // Remove query string
    .split('#')[0]               // Remove fragment
    .split(':')[0];              // Remove port
  
  // Check length
  if (domain.length > 253) {
    errors.push('Domain name exceeds maximum length of 253 characters');
  }
  
  // Check for valid characters
  const validCharsRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
  if (!validCharsRegex.test(domain) && domain.length > 1) {
    errors.push('Domain contains invalid characters. Use only letters, numbers, hyphens, and dots.');
  }
  
  // Check for consecutive dots
  if (domain.includes('..')) {
    errors.push('Domain cannot contain consecutive dots');
  }
  
  // Check for leading/trailing hyphens in labels
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.startsWith('-') || label.endsWith('-')) {
      errors.push('Domain labels cannot start or end with a hyphen');
      break;
    }
    if (label.length > 63) {
      errors.push('Domain labels cannot exceed 63 characters');
      break;
    }
  }
  
  // Parse TLD and SLD
  const tld = labels[labels.length - 1] || '';
  const sld = labels[labels.length - 2] || '';
  const subdomain = labels.length > 2 ? labels.slice(0, -2).join('.') : undefined;
  
  // Check TLD
  if (!tld) {
    errors.push('Domain must have a TLD (e.g., .com, .net)');
  } else if (labels.length < 2) {
    errors.push('Domain must have at least a second-level domain and TLD');
  }
  
  // Check for numeric-only TLD (IP addresses)
  if (/^\d+$/.test(tld)) {
    errors.push('Please enter a domain name, not an IP address');
  }
  
  return {
    isValid: errors.length === 0,
    domain: labels.length >= 2 ? `${sld}.${tld}` : domain,
    tld,
    sld,
    subdomain,
    errors
  };
}

// Normalize domain to root domain
export function normalizeToRootDomain(input: string): string {
  const result = validateDomain(input);
  return result.domain;
}

// Extract full domain as-is (with subdomains)
export function extractFullDomain(input: string): string {
  let domain = input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .split(':')[0];
  
  // Keep www if present
  return domain;
}

// Check if a string looks like an IP address
export function isIPAddress(input: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(input)) {
    const parts = input.split('.').map(Number);
    return parts.every(p => p >= 0 && p <= 255);
  }
  
  // IPv6 (basic check)
  const ipv6Regex = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
  return ipv6Regex.test(input);
}

// Parse a CIDR notation
export function parseCIDR(cidr: string): { ip: string; mask: number } | null {
  const parts = cidr.split('/');
  if (parts.length !== 2) return null;
  
  const ip = parts[0];
  const mask = parseInt(parts[1], 10);
  
  if (!isIPAddress(ip) || isNaN(mask) || mask < 0 || mask > 128) {
    return null;
  }
  
  return { ip, mask };
}
