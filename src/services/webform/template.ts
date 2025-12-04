import { WebFormDefinition } from '../../types';
import { buildLegacyWebFormHtml } from '../WebFormLegacyTemplate';
import { buildWebFormHtml } from '../WebFormTemplate';

export const buildLegacyTemplate = (def: WebFormDefinition, formKey: string): string => {
  return buildLegacyWebFormHtml(def, formKey);
};

export const buildReactTemplate = (def: WebFormDefinition, formKey: string): string => {
  return buildWebFormHtml(def, formKey);
};
