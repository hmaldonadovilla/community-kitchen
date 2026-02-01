const wordRegex = /[\p{L}\p{N}_-]+/gu;

const toTokens = (value: string) =>
  (value || '')
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.toLowerCase());

const toWords = (value: string) => {
  const words = (value || '').toString().match(wordRegex) || [];
  return words.map(word => word.toLowerCase());
};

export const matchesQueryTokens = (query: string, fields: Array<string | null | undefined>) => {
  const tokens = toTokens(query);
  if (!tokens.length) return false;

  const wordSet = new Set<string>();
  fields.forEach(field => {
    toWords(field || '').forEach(word => wordSet.add(word));
  });

  if (!wordSet.size) return false;

  return tokens.every(token => wordSet.has(token));
};
