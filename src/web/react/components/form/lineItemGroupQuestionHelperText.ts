export const shouldHideSupplementalHelperTextForDataSourceRows = (args: {
  hideWhenNoSourceRows?: boolean;
  entries?: Array<{ loading?: boolean; sourceRows?: any[] }>;
}): boolean => {
  if (!args.hideWhenNoSourceRows) return false;
  const entries = Array.isArray(args.entries) ? args.entries : [];
  if (!entries.length) return false;
  return entries.every(entry => !entry?.loading && (!Array.isArray(entry?.sourceRows) || entry.sourceRows.length === 0));
};
