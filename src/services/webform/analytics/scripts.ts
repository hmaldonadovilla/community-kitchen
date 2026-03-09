import { AnalyticsWidgetConfig, FormConfig, WebFormDefinition, WebFormSubmission } from '../../../types';

const ANALYTICS_SCRIPT_NAME_PATTERN = /^analytics_[A-Za-z0-9_]+$/;

export interface AnalyticsScriptExecutionContext {
  form: FormConfig;
  definition: WebFormDefinition;
  records: WebFormSubmission[];
  rows: Array<Record<string, any>>;
  widget: AnalyticsWidgetConfig;
}

type AnalyticsScriptFn = (ctx: AnalyticsScriptExecutionContext, args?: Record<string, any>) => any;

export const isValidAnalyticsScriptName = (functionName: string): boolean => {
  const candidate = (functionName || '').toString().trim();
  return ANALYTICS_SCRIPT_NAME_PATTERN.test(candidate);
};

const resolveAnalyticsScript = (functionName: string): AnalyticsScriptFn => {
  const name = (functionName || '').toString().trim();
  if (!isValidAnalyticsScriptName(name)) {
    throw new Error(`Invalid analytics script function name: "${name}"`);
  }
  const fn = (globalThis as any)[name];
  if (typeof fn !== 'function') {
    throw new Error(`Analytics script function "${name}" was not found.`);
  }
  return fn as AnalyticsScriptFn;
};

export const runAnalyticsScript = (
  functionName: string,
  context: AnalyticsScriptExecutionContext,
  args?: Record<string, any>
): any => {
  const fn = resolveAnalyticsScript(functionName);
  return fn(context, args);
};

