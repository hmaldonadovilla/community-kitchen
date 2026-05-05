import { useCallback, useMemo } from 'react';

import type { LangCode, WebFormDefinition } from '../../../types';
import {
  hasStatusTransitionValue,
  matchesStatusTransition,
  resolveStatusTransitionValue
} from '../../../../domain/statusTransitions';

/**
 * Owner: App status transition presentation policy.
 * Resolves status labels and automatic view routing helpers from form
 * configuration without owning record state or navigation effects.
 */
export const useAppStatusTransitions = (args: {
  definition: WebFormDefinition;
  language: LangCode;
}) => {
  const { definition, language } = args;
  const statusTransitions = definition.followup?.statusTransitions;
  const closedStatusLabel = useMemo(
    () => resolveStatusTransitionValue(statusTransitions, 'onClose', language, { includeDefaultOnClose: true }) || 'Closed',
    [language, statusTransitions]
  );
  const hasProgressStatus = useMemo(
    () =>
      hasStatusTransitionValue(statusTransitions, 'inProgress') ||
      hasStatusTransitionValue(statusTransitions, 'reOpened'),
    [statusTransitions]
  );
  const matchesClosedStatus = useCallback(
    (rawStatus: any) => matchesStatusTransition(rawStatus, statusTransitions, 'onClose', { includeDefaultOnClose: true }),
    [statusTransitions]
  );
  const resolveStatusAutoView = useCallback(
    (
      rawStatus: any,
      summaryEnabled: boolean
    ): { view: 'form' | 'summary'; statusKey: 'onClose' | 'inProgress' | 'reOpened' | 'other' | 'fallback' } => {
      if (matchesClosedStatus(rawStatus)) {
        return { view: summaryEnabled ? 'summary' : 'form', statusKey: 'onClose' };
      }
      if (matchesStatusTransition(rawStatus, statusTransitions, 'inProgress')) {
        return { view: 'form', statusKey: 'inProgress' };
      }
      if (matchesStatusTransition(rawStatus, statusTransitions, 'reOpened')) {
        return { view: 'form', statusKey: 'reOpened' };
      }
      if (!hasProgressStatus) {
        return { view: 'form', statusKey: 'fallback' };
      }
      return { view: summaryEnabled ? 'summary' : 'form', statusKey: 'other' };
    },
    [hasProgressStatus, matchesClosedStatus, statusTransitions]
  );

  return {
    statusTransitions,
    closedStatusLabel,
    matchesClosedStatus,
    resolveStatusAutoView
  };
};
