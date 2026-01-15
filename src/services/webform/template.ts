import { WebFormDefinition } from '../../types';
import { buildWebFormHtml } from '../WebFormTemplate';

export const buildReactTemplate = (
  def: WebFormDefinition,
  formKey: string,
  bootstrap?: any,
  bundleTarget?: string
): string => {
  return buildWebFormHtml(def, formKey, bootstrap, bundleTarget);
};

export const buildReactShellTemplate = (formKey: string, bundleTarget?: string): string => {
  return buildWebFormHtml(null, formKey, null, bundleTarget);
};
