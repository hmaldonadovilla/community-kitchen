import type { FormErrors } from '../../../types';

const pickGroupErrors = (errors: FormErrors, groupKey: string): FormErrors => {
  if (!groupKey) return {};
  const prefix = `${groupKey}__`;
  const subPrefix = `${groupKey}::`;
  return Object.fromEntries(
    Object.entries(errors || {}).filter(([key]) => key === groupKey || key.startsWith(prefix) || key.startsWith(subPrefix))
  );
};

export const resolveOverlayDetailErrors = (args: {
  errorGroupKey: string;
  lineOverlayOpen: boolean;
  lineOverlayGroupId: string;
  subgroupOverlayOpen: boolean;
  subgroupOverlaySubKey: string;
  lineOverlayErrors?: FormErrors | null;
  subgroupOverlayErrors?: FormErrors | null;
  fallbackErrors: FormErrors;
}): FormErrors => {
  const lineOverlayPrefix = `${args.lineOverlayGroupId || ''}::`;
  const subgroupOverlayPrefix = `${args.subgroupOverlaySubKey || ''}::`;
  const isLineOverlayScope =
    !!args.lineOverlayOpen &&
    !!args.lineOverlayGroupId &&
    (args.errorGroupKey === args.lineOverlayGroupId || args.errorGroupKey.startsWith(lineOverlayPrefix));
  const isSubgroupOverlayScope =
    !!args.subgroupOverlayOpen &&
    !!args.subgroupOverlaySubKey &&
    (args.errorGroupKey === args.subgroupOverlaySubKey || args.errorGroupKey.startsWith(subgroupOverlayPrefix));

  if (isLineOverlayScope) return pickGroupErrors(args.lineOverlayErrors || {}, args.errorGroupKey);
  if (isSubgroupOverlayScope) return pickGroupErrors(args.subgroupOverlayErrors || {}, args.errorGroupKey);
  return args.fallbackErrors || {};
};
