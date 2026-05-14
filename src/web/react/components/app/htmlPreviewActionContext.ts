export type HtmlPreviewActionContext = {
  values?: Record<string, string>;
  missingRequiredValues?: string[];
};

type AttributeReader = (name: string) => string | null | undefined;
type ValueReader = (selector: string) => string | undefined;

const normalizeText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

const isTrueish = (value: unknown): boolean => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const parseStaticValues = (raw: string): Record<string, string> => {
  const text = normalizeText(raw);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      const fieldId = normalizeText(key);
      if (!fieldId) return acc;
      acc[fieldId] = value === undefined || value === null ? '' : value.toString();
      return acc;
    }, {});
  } catch {
    return {};
  }
};

export const resolveHtmlPreviewActionContext = (args: {
  getAttribute: AttributeReader;
  readValue: ValueReader;
}): HtmlPreviewActionContext | undefined => {
  const attr = (name: string): string => normalizeText(args.getAttribute(name));
  const values = parseStaticValues(attr('data-ck-action-values'));
  const missingRequiredValues: string[] = [];

  const fieldId = attr('data-ck-action-value-field') || attr('data-ck-action-field');
  if (fieldId) {
    const sourceSelector = attr('data-ck-action-value-source') || attr('data-ck-action-source');
    const value = args.readValue(sourceSelector);
    const normalizedValue = value === undefined || value === null ? '' : value.toString();
    if (!normalizedValue.trim() && isTrueish(attr('data-ck-action-value-required'))) {
      missingRequiredValues.push(fieldId);
    } else {
      values[fieldId] = normalizedValue;
    }
  }

  if (!Object.keys(values).length && !missingRequiredValues.length) return undefined;
  return {
    ...(Object.keys(values).length ? { values } : {}),
    ...(missingRequiredValues.length ? { missingRequiredValues } : {})
  };
};
