const READY_FOR_PRODUCTION_LOCK_RULE_ID = 'ready-for-production-order-lock';

const normalizeId = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const parseUnlockParam = (rawParams: string): string | undefined => {
  const raw = normalizeId(rawParams);
  if (!raw) return undefined;
  try {
    const params = new URLSearchParams(raw);
    const unlock = normalizeId(params.get('unlock'));
    return unlock || undefined;
  } catch (_) {
    return undefined;
  }
};

const stripUnlockParam = (rawParams: string): { value: string; changed: boolean } => {
  const raw = normalizeId(rawParams);
  if (!raw) return { value: '', changed: false };
  try {
    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    const hadUnlock = params.has('unlock');
    if (!hadUnlock) return { value: params.toString(), changed: false };
    params.delete('unlock');
    return { value: params.toString(), changed: true };
  } catch (_) {
    return { value: raw.startsWith('?') ? raw.slice(1) : raw, changed: false };
  }
};

const stripUnlockFromHash = (hash: string): { value: string; changed: boolean } => {
  const raw = normalizeId(hash);
  if (!raw) return { value: '', changed: false };
  const hashBody = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!hashBody) return { value: '', changed: false };

  const queryIdx = hashBody.indexOf('?');
  if (queryIdx >= 0) {
    const base = hashBody.slice(0, queryIdx);
    const queryRaw = hashBody.slice(queryIdx + 1);
    const stripped = stripUnlockParam(queryRaw);
    if (!stripped.changed) return { value: raw.startsWith('#') ? raw : `#${hashBody}`, changed: false };
    const rebuilt = stripped.value ? `${base}?${stripped.value}` : base;
    return { value: rebuilt ? `#${rebuilt}` : '', changed: true };
  }

  if (!hashBody.includes('=')) return { value: raw.startsWith('#') ? raw : `#${hashBody}`, changed: false };
  const stripped = stripUnlockParam(hashBody);
  if (!stripped.changed) return { value: raw.startsWith('#') ? raw : `#${hashBody}`, changed: false };
  return { value: stripped.value ? `#${stripped.value}` : '', changed: true };
};

const readUnlockFromObject = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const entry = normalizeId((value as any).unlock);
  return entry || undefined;
};

const parseUnlockRecordIdFromHash = (hash: string): string | undefined => {
  const hashRaw = normalizeId(hash);
  if (!hashRaw) return undefined;
  const hashWithoutPound = hashRaw.startsWith('#') ? hashRaw.slice(1) : hashRaw;
  const queryIdx = hashWithoutPound.indexOf('?');
  if (queryIdx >= 0) {
    const fromHashQuery = parseUnlockRecordIdFromSearch(hashWithoutPound.slice(queryIdx + 1));
    if (fromHashQuery) return fromHashQuery;
  }
  return parseUnlockRecordIdFromSearch(hashWithoutPound);
};

/**
 * Parses the optional `unlock` query parameter from a URL search string.
 * Returns a normalized record id or `undefined` when not present.
 */
export const parseUnlockRecordIdFromSearch = (search: string): string | undefined => {
  const rawSearch = normalizeId(search);
  if (!rawSearch) return undefined;
  return parseUnlockParam(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch);
};

export type UnlockRecordIdSource =
  | 'requestParams'
  | 'bootstrapRequestParams'
  | 'search'
  | 'hash'
  | 'href'
  | 'none';

export type UnlockRecordIdResolution = {
  unlockRecordId?: string;
  source: UnlockRecordIdSource;
};

/**
 * Resolve `unlock` from the most reliable source first. In Google Apps Script web apps,
 * custom query params are often dropped inside the iframe, so server-injected request params
 * are checked before URL-derived fallbacks.
 */
export const resolveUnlockRecordId = (args: {
  requestParams?: unknown;
  bootstrap?: unknown;
  search?: string;
  hash?: string;
  href?: string;
}): UnlockRecordIdResolution => {
  const fromRequestParams = readUnlockFromObject(args.requestParams);
  if (fromRequestParams) return { unlockRecordId: fromRequestParams, source: 'requestParams' };

  const fromBootstrapParams = readUnlockFromObject((args.bootstrap as any)?.requestParams);
  if (fromBootstrapParams) return { unlockRecordId: fromBootstrapParams, source: 'bootstrapRequestParams' };

  const fromSearch = parseUnlockRecordIdFromSearch(args.search || '');
  if (fromSearch) return { unlockRecordId: fromSearch, source: 'search' };

  const fromHash = parseUnlockRecordIdFromHash(args.hash || '');
  if (fromHash) return { unlockRecordId: fromHash, source: 'hash' };

  const hrefRaw = normalizeId(args.href);
  if (hrefRaw) {
    try {
      const url = new URL(hrefRaw);
      const fromHrefSearch = parseUnlockRecordIdFromSearch(url.search || '');
      if (fromHrefSearch) return { unlockRecordId: fromHrefSearch, source: 'href' };
      const fromHrefHash = parseUnlockRecordIdFromHash(url.hash || '');
      if (fromHrefHash) return { unlockRecordId: fromHrefHash, source: 'href' };
    } catch (_) {
      const queryIdx = hrefRaw.indexOf('?');
      if (queryIdx >= 0) {
        const hashIdx = hrefRaw.indexOf('#', queryIdx);
        const queryRaw = hashIdx >= 0 ? hrefRaw.slice(queryIdx + 1, hashIdx) : hrefRaw.slice(queryIdx + 1);
        const fromHrefQuery = parseUnlockRecordIdFromSearch(queryRaw);
        if (fromHrefQuery) return { unlockRecordId: fromHrefQuery, source: 'href' };
      }
    }
  }

  return { unlockRecordId: undefined, source: 'none' };
};

/**
 * Removes `unlock` from URL search/hash without changing any other query params.
 * Returns the original URL when no removal is needed or parsing fails.
 */
export const removeUnlockParamFromHref = (href: string): { href: string; changed: boolean } => {
  const rawHref = normalizeId(href);
  if (!rawHref) return { href: rawHref, changed: false };
  try {
    const url = new URL(rawHref);
    let changed = false;
    if (url.searchParams.has('unlock')) {
      url.searchParams.delete('unlock');
      changed = true;
    }
    const hashStripped = stripUnlockFromHash(url.hash || '');
    if (hashStripped.changed) {
      url.hash = hashStripped.value;
      changed = true;
    }
    return { href: changed ? url.toString() : rawHref, changed };
  } catch (_) {
    const queryIdx = rawHref.indexOf('?');
    if (queryIdx < 0) return { href: rawHref, changed: false };
    const hashIdx = rawHref.indexOf('#', queryIdx);
    const base = rawHref.slice(0, queryIdx);
    const queryRaw = hashIdx >= 0 ? rawHref.slice(queryIdx + 1, hashIdx) : rawHref.slice(queryIdx + 1);
    const hashRaw = hashIdx >= 0 ? rawHref.slice(hashIdx) : '';
    const strippedQuery = stripUnlockParam(queryRaw);
    const strippedHash = stripUnlockFromHash(hashRaw);
    if (!strippedQuery.changed && !strippedHash.changed) return { href: rawHref, changed: false };
    const rebuiltQuery = strippedQuery.value ? `?${strippedQuery.value}` : '';
    const rebuiltHash = strippedHash.value || '';
    return { href: `${base}${rebuiltQuery}${rebuiltHash}`, changed: true };
  }
};

export const shouldBypassReadyForProductionLock = (args: {
  activeRuleId?: string;
  unlockRecordId?: string;
  recordId?: string;
}): boolean => {
  const ruleId = normalizeId(args.activeRuleId);
  if (ruleId !== READY_FOR_PRODUCTION_LOCK_RULE_ID) return false;
  const unlockRecordId = normalizeId(args.unlockRecordId);
  const recordId = normalizeId(args.recordId);
  if (!unlockRecordId || !recordId) return false;
  return unlockRecordId === recordId;
};

/**
 * Reads the optional status value to apply when the dedicated unlock override is active.
 * This setting is only read from the `ready-for-production-order-lock` disable rule.
 */
export const resolveReadyForProductionUnlockStatus = (rules: Array<unknown> | undefined): string | undefined => {
  const list = Array.isArray(rules) ? rules : [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = normalizeId((entry as any).id);
    if (id !== READY_FOR_PRODUCTION_LOCK_RULE_ID) continue;
    const unlockStatus = normalizeId((entry as any).unlockStatus);
    return unlockStatus || undefined;
  }
  return undefined;
};

export { READY_FOR_PRODUCTION_LOCK_RULE_ID };
