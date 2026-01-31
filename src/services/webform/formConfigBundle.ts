import { FormConfigExport } from '../../types';
import { BUNDLED_CONFIG_ENV, BUNDLED_FORM_CONFIGS } from '../../config/bundledFormConfigs';

const normalizeKey = (value: any): string => (value == null ? '' : value.toString()).trim().toLowerCase();

const buildCandidateKeys = (config: FormConfigExport): string[] => {
  const form: any = (config && (config as any).form) || {};
  return [config?.formKey, form?.configSheet, form?.title, form?.appUrl, form?.formId]
    .map(normalizeKey)
    .filter(Boolean);
};

export const selectBundledFormConfig = (
  configs: FormConfigExport[] | null | undefined,
  formKey?: string | null
): FormConfigExport | null => {
  const list = Array.isArray(configs) ? configs.filter(Boolean) : [];
  if (!list.length) return null;
  const key = normalizeKey(formKey);
  if (!key) return list[0] || null;
  const match = list.find(cfg => buildCandidateKeys(cfg).includes(key));
  return match || null;
};

export const getBundledFormConfig = (formKey?: string | null): FormConfigExport | null =>
  selectBundledFormConfig(BUNDLED_FORM_CONFIGS, formKey);

export const listBundledFormConfigs = (): FormConfigExport[] =>
  Array.isArray(BUNDLED_FORM_CONFIGS) ? BUNDLED_FORM_CONFIGS : [];

export const getBundledConfigEnv = (): string | null => {
  const env = (BUNDLED_CONFIG_ENV || '').toString().trim();
  return env ? env : null;
};
