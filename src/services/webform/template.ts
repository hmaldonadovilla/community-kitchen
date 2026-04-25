import { WebFormDefinition } from '../../types';
import { buildWebFormHtml } from '../WebFormTemplate';
import { ServerTimingRecorder } from './serverTiming';

export const buildReactTemplate = (
  def: WebFormDefinition,
  formKey: string,
  bootstrap?: any,
  bundleTarget?: string,
  requestParams?: Record<string, string>,
  serverTiming?: ServerTimingRecorder | null
): string => {
  return buildWebFormHtml(def, formKey, bootstrap, bundleTarget, requestParams, serverTiming);
};

export const buildReactShellTemplate = (
  formKey: string,
  bundleTarget?: string,
  requestParams?: Record<string, string>,
  serverTiming?: ServerTimingRecorder | null,
  bootstrap?: any
): string => {
  return buildWebFormHtml(null, formKey, bootstrap, bundleTarget, requestParams, serverTiming);
};
