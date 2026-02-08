import { WebFormDefinition } from '../../types';
import { buildWebFormHtml } from '../WebFormTemplate';

export const buildReactTemplate = (
  def: WebFormDefinition,
  formKey: string,
  bootstrap?: any,
  bundleTarget?: string,
  requestParams?: Record<string, string>
): string => {
  return buildWebFormHtml(def, formKey, bootstrap, bundleTarget, requestParams);
};

export const buildReactShellTemplate = (
  formKey: string,
  bundleTarget?: string,
  requestParams?: Record<string, string>
): string => {
  return buildWebFormHtml(null, formKey, null, bundleTarget, requestParams);
};
