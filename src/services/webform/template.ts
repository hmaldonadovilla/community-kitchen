import { WebFormDefinition } from '../../types';
import { buildWebFormHtml } from '../WebFormTemplate';

export const buildReactTemplate = (def: WebFormDefinition, formKey: string, bootstrap?: any): string => {
  return buildWebFormHtml(def, formKey, bootstrap);
};
