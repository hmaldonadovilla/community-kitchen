export const shouldHideSupplementalHelperTextForDataSourceRows = (args: {
  hideWhenNoSourceRows?: boolean;
  entries?: Array<{ loading?: boolean; sourceRows?: any[] }>;
}): boolean => {
  if (!args.hideWhenNoSourceRows) return false;
  const entries = Array.isArray(args.entries) ? args.entries : [];
  if (!entries.length) return true;
  return !entries.some(entry => Array.isArray(entry?.sourceRows) && entry.sourceRows.length > 0);
};
