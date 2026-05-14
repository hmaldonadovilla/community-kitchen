const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parseIsoDateParts = (value: string): { year: number; monthIndex: number; day: number } | null => {
  const text = (value || '').toString().trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, monthIndex: month - 1, day };
};

export const formatAnalyticsReportDateToken = (isoDate: string): string => {
  const text = (isoDate || '').toString().trim();
  const parts = parseIsoDateParts(text);
  if (!parts) return text;
  const date = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day));
  const weekday = WEEKDAY_LABELS[date.getUTCDay()] || '';
  const month = MONTH_LABELS[parts.monthIndex] || '';
  return `${weekday},${`${parts.day}`.padStart(2, '0')}-${month}-${parts.year}`;
};

export const buildAnalyticsReportTemplatePlaceholders = (args: {
  title: string;
  startDate: string;
  endDate: string;
  recordCount: number;
  rowCount: number;
  attachmentName?: string;
  sourceForm?: string;
}): Record<string, string> => ({
  '{{PIPELINE_TITLE}}': args.title,
  '{{START_DATE}}': formatAnalyticsReportDateToken(args.startDate),
  '{{END_DATE}}': formatAnalyticsReportDateToken(args.endDate),
  '{{START_DATE_ISO}}': args.startDate,
  '{{END_DATE_ISO}}': args.endDate,
  '{{RECORD_COUNT}}': `${args.recordCount}`,
  '{{ROW_COUNT}}': `${args.rowCount}`,
  '{{ATTACHMENT_NAME}}': args.attachmentName || '',
  '{{SOURCE_FORM}}': args.sourceForm || ''
});

const roundReportQuantity = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const isTablespoonUnit = (unit: string): boolean => {
  const normalized = (unit || '').toString().trim().toLowerCase();
  return normalized === 'tbsp' || normalized === 'tablespoon' || normalized === 'tablespoons';
};

const isGramUnit = (unit: string): boolean => {
  const normalized = (unit || '').toString().trim().toLowerCase();
  return normalized === 'gr' || normalized === 'g' || normalized === 'gram' || normalized === 'grams';
};

export const normalizeIngredientUsageQuantity = (args: {
  quantity: number;
  unit: string;
  tablespoonGrams?: number | null;
}): { quantity: number; unit: string; missingTablespoonConversion: boolean } => {
  let quantity = args.quantity;
  let unit = (args.unit || '').toString().trim();
  let missingTablespoonConversion = false;

  if (isTablespoonUnit(unit)) {
    const gramsPerTablespoon = args.tablespoonGrams;
    if (typeof gramsPerTablespoon === 'number' && Number.isFinite(gramsPerTablespoon) && gramsPerTablespoon > 0) {
      quantity *= gramsPerTablespoon;
      unit = 'gr';
    } else {
      missingTablespoonConversion = true;
    }
  }

  if (isGramUnit(unit) && quantity > 1000) {
    quantity /= 1000;
    unit = 'kg';
  }

  return {
    quantity: roundReportQuantity(quantity),
    unit,
    missingTablespoonConversion
  };
};
