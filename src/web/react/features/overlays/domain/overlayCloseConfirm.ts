import type { VisibilityContext } from '../../../../types';
import type {
  OverlayCloseConfirmCaseConfig,
  OverlayCloseConfirmConfig,
  OverlayCloseConfirmLike,
  RowFlowActionConfirmConfig,
  RowFlowActionEffect,
  WhenClause
} from '../../../../../types';
import { matchesWhenClause } from '../../../../rules/visibility';

export type ResolvedOverlayCloseConfirm = {
  confirm: RowFlowActionConfirmConfig;
  onConfirmEffects: RowFlowActionEffect[];
  highlightFirstError: boolean;
  validateOnReopen: boolean;
  allowCloseFromEdit: boolean;
  source: 'case' | 'default' | 'simple';
};

export const isOverlayCloseConfirmConfig = (value: unknown): value is OverlayCloseConfirmConfig => {
  if (!value || typeof value !== 'object') return false;
  const cases = (value as any).cases;
  return Array.isArray(cases);
};

export const getOverlayCloseAllowCloseFromEdit = (value: OverlayCloseConfirmLike | undefined): boolean => {
  if (!value) return false;
  if (!isOverlayCloseConfirmConfig(value)) return false;
  return value.allowCloseFromEdit === true;
};

const resolveCaseConfirm = (cfg: OverlayCloseConfirmCaseConfig): RowFlowActionConfirmConfig => {
  const { when: _when, onConfirmEffects: _effects, highlightFirstError: _hf, validateOnReopen: _vor, ...confirm } = cfg;
  return confirm;
};

export const resolveOverlayCloseConfirm = (args: {
  closeConfirm?: OverlayCloseConfirmLike;
  ctx: VisibilityContext;
  scope?: { rowId?: string; linePrefix?: string };
}): ResolvedOverlayCloseConfirm | null => {
  const closeConfirm = args.closeConfirm;
  if (!closeConfirm) return null;

  if (!isOverlayCloseConfirmConfig(closeConfirm)) {
    return {
      confirm: closeConfirm,
      onConfirmEffects: [],
      highlightFirstError: false,
      validateOnReopen: false,
      allowCloseFromEdit: false,
      source: 'simple'
    };
  }

  const allowCloseFromEdit = closeConfirm.allowCloseFromEdit === true;
  const cases = Array.isArray(closeConfirm.cases) ? closeConfirm.cases : [];
  const scope = args.scope;

  for (const c of cases) {
    if (!c || typeof c !== 'object') continue;
    const when = (c as any).when as WhenClause | undefined;
    const matches = when ? matchesWhenClause(when, args.ctx, scope) : true;
    if (!matches) continue;
    const effects = Array.isArray(c.onConfirmEffects) ? (c.onConfirmEffects as RowFlowActionEffect[]) : [];
    return {
      confirm: resolveCaseConfirm(c),
      onConfirmEffects: effects,
      highlightFirstError: c.highlightFirstError === true,
      validateOnReopen: c.validateOnReopen === true,
      allowCloseFromEdit,
      source: 'case'
    };
  }

  if (closeConfirm.default) {
    const effects = Array.isArray(closeConfirm.defaultOnConfirmEffects) ? closeConfirm.defaultOnConfirmEffects : [];
    return {
      confirm: closeConfirm.default,
      onConfirmEffects: effects,
      highlightFirstError: false,
      validateOnReopen: false,
      allowCloseFromEdit,
      source: 'default'
    };
  }

  return null;
};
