const normalizeActionToken = (value: string): string =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^\+\s+/, '+');

const PRIMARY_ACTION_LABELS = new Set([
  'view/edit',
  'ingredients needed',
  'view/edit ingredients',
  'edit ingredients',
  'back to production',
  'back',
  'add ingredient',
  'add ingredients',
  'add line',
  'add lines',
  '+add ingredient',
  '+another leftover',
  '+add leftover',
  'close',
  'refresh',
  'tap to collapse',
  'tap to collaps',
  'tap to expand'
].map(normalizeActionToken));

export const isPrimaryActionLabel = (label: string): boolean => PRIMARY_ACTION_LABELS.has(normalizeActionToken(label));

export const resolveButtonTonePrimary = (label: string, toneRaw: unknown): boolean => {
  const tone = normalizeActionToken(toneRaw === undefined || toneRaw === null ? '' : toneRaw.toString());
  if (tone === 'primary') return true;
  if (tone === 'secondary') return false;
  return isPrimaryActionLabel(label);
};

