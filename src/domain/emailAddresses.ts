export type EmailAddressListParseResult = {
  valid: boolean;
  addresses: string[];
  normalized: string;
  invalidTokens: string[];
};

const LOCAL_PART_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export const isValidEmailAddress = (value: unknown): boolean => {
  const address = value === undefined || value === null ? '' : value.toString().trim();
  if (!address || address.length > 254 || /\s/.test(address)) return false;
  const atIndex = address.indexOf('@');
  if (atIndex <= 0 || atIndex !== address.lastIndexOf('@')) return false;

  const local = address.slice(0, atIndex);
  const domain = address.slice(atIndex + 1);
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (!LOCAL_PART_PATTERN.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  const labels = domain.split('.');
  if (labels.some(label => !DOMAIN_LABEL_PATTERN.test(label))) return false;
  return true;
};

export const parseEmailAddressList = (
  value: unknown,
  options?: { allowMultiple?: boolean }
): EmailAddressListParseResult => {
  const raw = value === undefined || value === null ? '' : value.toString().trim();
  if (!raw) {
    return { valid: true, addresses: [], normalized: '', invalidTokens: [] };
  }

  const allowMultiple = options?.allowMultiple !== false;
  const tokens = raw.split(',');
  const invalidTokens: string[] = [];
  const addresses: string[] = [];
  const seen = new Set<string>();

  if (!allowMultiple && tokens.length > 1) {
    invalidTokens.push(...tokens.slice(1).map(token => token.trim()).filter(Boolean));
  }

  tokens.forEach(token => {
    const address = token.trim();
    if (!address || !isValidEmailAddress(address)) {
      invalidTokens.push(address || '(empty)');
      return;
    }
    const dedupKey = address.toLowerCase();
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    const atIndex = address.lastIndexOf('@');
    addresses.push(`${address.slice(0, atIndex)}@${address.slice(atIndex + 1).toLowerCase()}`);
  });

  const uniqueInvalidTokens = Array.from(new Set(invalidTokens));
  return {
    valid: uniqueInvalidTokens.length === 0,
    addresses,
    normalized: addresses.join(', '),
    invalidTokens: uniqueInvalidTokens
  };
};
