export const isAllowedNumberInputKey = (key: string): boolean => {
  const k = (key || '').toString();
  if (k.length !== 1) return true;
  const allowed = '0123456789.,-';
  return allowed.includes(k);
};

export const isAllowedNumberInputText = (text: string): boolean => {
  const trimmed = (text || '').toString().trim();
  if (!trimmed) return true;
  return /^[0-9.,\-\s]+$/.test(trimmed);
};

