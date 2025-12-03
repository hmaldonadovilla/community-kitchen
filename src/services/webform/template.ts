import { WebFormDefinition } from '../../types';
import { buildWebFormHtml } from '../WebFormTemplate';
import { buildReactWebFormHtml } from '../WebFormReactTemplate';

export const buildLegacyTemplate = (def: WebFormDefinition, formKey: string): string => {
  return buildWebFormHtml(def, formKey);
};

export const buildReactTemplate = (def: WebFormDefinition, formKey: string): string => {
  return buildReactWebFormHtml(def, formKey);
};
