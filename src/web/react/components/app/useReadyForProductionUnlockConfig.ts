import { useMemo } from 'react';

import type { WebFormDefinition } from '../../../types';
import { resolveReadyForProductionUnlockSet, resolveUnlockRecordId } from '../../app/readyForProductionLock';

/**
 * Owner: App ready-for-production unlock configuration.
 * Resolves bootstrap/request unlock metadata and target status without owning
 * the transition side effect that applies the unlock.
 */
export const useReadyForProductionUnlockConfig = (definition: WebFormDefinition) => {
  const readyForProductionUnlockResolution = useMemo(() => {
    const globalAny = globalThis as any;
    const locationSearch = (() => {
      try {
        return globalAny?.location?.search || '';
      } catch {
        return '';
      }
    })();
    const locationHash = (() => {
      try {
        return globalAny?.location?.hash || '';
      } catch {
        return '';
      }
    })();
    const locationHref = (() => {
      try {
        return globalAny?.location?.href || '';
      } catch {
        return '';
      }
    })();
    return resolveUnlockRecordId({
      requestParams: globalAny?.__WEB_FORM_REQUEST_PARAMS__,
      bootstrap: globalAny?.__WEB_FORM_BOOTSTRAP__,
      search: locationSearch,
      hash: locationHash,
      href: locationHref
    });
  }, []);
  const readyForProductionUnlockSet = useMemo(
    () => resolveReadyForProductionUnlockSet(definition.fieldDisableRules),
    [definition.fieldDisableRules]
  );

  return {
    readyForProductionUnlockResolution,
    readyForProductionUnlockSet
  };
};
