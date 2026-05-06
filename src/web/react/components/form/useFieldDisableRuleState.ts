import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { FieldDisableRule, VisibilityContext } from '../../../types';
import type { SystemRecordMeta } from '../../../rules/systemFields';
import { matchesWhenClause } from '../../../rules/visibility';
import { isFieldDisabledByRule, resolveActiveFieldDisableRule } from '../../app/fieldDisableRules';
import {
  removeUnlockParamFromHref,
  resolveUnlockRecordId,
  shouldBypassReadyForProductionLock
} from '../../app/readyForProductionLock';

type UseFieldDisableRuleStateArgs = {
  fieldDisableRules?: FieldDisableRule[];
  topVisibilityCtx: VisibilityContext;
  recordMeta?: SystemRecordMeta | null;
  onDiagnostic?: (event: string, payload?: any) => void;
};

type UseFieldDisableRuleStateResult = {
  isFieldLockedByDedup: (fieldId: string) => boolean;
};

const readLocationPart = (part: 'search' | 'hash' | 'href'): string => {
  try {
    return ((globalThis as any)?.location?.[part] || '').toString();
  } catch {
    return '';
  }
};

/**
 * Owner: form field-disable state and ready-for-production unlock behavior.
 * Resolves active disable rules, handles one-time unlock URL cleanup, and
 * exposes the predicate consumed by form and line-item renderers.
 */
export const useFieldDisableRuleState = ({
  fieldDisableRules,
  topVisibilityCtx,
  recordMeta,
  onDiagnostic
}: UseFieldDisableRuleStateArgs): UseFieldDisableRuleStateResult => {
  const unlockResolution = useMemo(() => {
    const globalAny = globalThis as any;
    return resolveUnlockRecordId({
      requestParams: globalAny?.__WEB_FORM_REQUEST_PARAMS__,
      bootstrap: globalAny?.__WEB_FORM_BOOTSTRAP__,
      search: readLocationPart('search'),
      hash: readLocationPart('hash'),
      href: readLocationPart('href')
    });
  }, []);

  useEffect(() => {
    if (!onDiagnostic || !unlockResolution.unlockRecordId) return;
    onDiagnostic('readyForProduction.unlock.query', {
      unlockRecordId: unlockResolution.unlockRecordId,
      source: unlockResolution.source
    });
  }, [onDiagnostic, unlockResolution]);

  useEffect(() => {
    if (!unlockResolution.unlockRecordId) return;
    try {
      const globalAny = globalThis as any;
      const tryScrubWindowHref = (target: any, scope: 'self' | 'top'): boolean => {
        if (!target) return false;
        const hrefRaw = (target?.location?.href || '').toString();
        if (!hrefRaw) return false;
        const cleaned = removeUnlockParamFromHref(hrefRaw);
        if (!cleaned.changed || !cleaned.href || cleaned.href === hrefRaw) return false;
        const historyApi = target?.history;
        if (!historyApi || typeof historyApi.replaceState !== 'function') return false;
        historyApi.replaceState(historyApi.state || null, '', cleaned.href);
        onDiagnostic?.('readyForProduction.unlock.urlScrubbed', {
          source: unlockResolution.source,
          scope,
          changed: true
        });
        return true;
      };
      tryScrubWindowHref(globalAny, 'self');
      if (globalAny?.top && globalAny.top !== globalAny) {
        try {
          tryScrubWindowHref(globalAny.top, 'top');
        } catch {
          // Ignore cross-origin access failures.
        }
      }
    } catch {
      onDiagnostic?.('readyForProduction.unlock.urlScrubbed.error', {
        source: unlockResolution.source
      });
    }
  }, [onDiagnostic, unlockResolution.unlockRecordId, unlockResolution.source]);

  const activeFieldDisableRule = useMemo(
    () =>
      resolveActiveFieldDisableRule({
        rules: fieldDisableRules,
        matchesWhen: when => matchesWhenClause(when, topVisibilityCtx)
      }),
    [fieldDisableRules, topVisibilityCtx]
  );

  const bypassReadyForProductionLock = useMemo(
    () =>
      shouldBypassReadyForProductionLock({
        activeRuleId: activeFieldDisableRule?.id,
        unlockRecordId: unlockResolution.unlockRecordId,
        recordId: recordMeta?.id !== undefined && recordMeta?.id !== null ? recordMeta.id.toString() : undefined
      }),
    [activeFieldDisableRule?.id, recordMeta?.id, unlockResolution.unlockRecordId]
  );

  const effectiveFieldDisableRule = bypassReadyForProductionLock ? undefined : activeFieldDisableRule;
  const activeFieldDisableRuleKeyRef = useRef<string>('');

  useEffect(() => {
    if (!onDiagnostic) return;
    const nextKey = effectiveFieldDisableRule
      ? `${effectiveFieldDisableRule.id || '__anonymous__'}::${(effectiveFieldDisableRule.bypassFields || []).join(',')}`
      : bypassReadyForProductionLock
        ? `unlock::${unlockResolution.unlockRecordId || ''}::${(recordMeta?.id || '').toString()}`
        : '';
    if (activeFieldDisableRuleKeyRef.current === nextKey) return;
    activeFieldDisableRuleKeyRef.current = nextKey;
    onDiagnostic('fieldDisableRules.state', {
      active: Boolean(effectiveFieldDisableRule),
      ruleId: effectiveFieldDisableRule?.id || null,
      matchedRuleId: activeFieldDisableRule?.id || null,
      bypassFields: effectiveFieldDisableRule?.bypassFields || [],
      unlockOverrideActive: bypassReadyForProductionLock,
      unlockRecordId: unlockResolution.unlockRecordId || null,
      unlockSource: unlockResolution.source,
      recordId: recordMeta?.id || null,
      recordMeta,
      reason: bypassReadyForProductionLock ? 'unlockOverride' : effectiveFieldDisableRule ? 'matched' : 'noMatch'
    });
  }, [
    activeFieldDisableRule?.id,
    bypassReadyForProductionLock,
    effectiveFieldDisableRule,
    onDiagnostic,
    recordMeta,
    recordMeta?.id,
    unlockResolution
  ]);

  const isFieldLockedByDedup = useCallback(
    (fieldId: string): boolean => isFieldDisabledByRule(fieldId, effectiveFieldDisableRule),
    [effectiveFieldDisableRule]
  );

  return { isFieldLockedByDedup };
};
