import type { ReservationReconciliationFeedbackConfig } from '../../../types';
import { resolveLocalizedString } from '../../i18n';
import type { LangCode } from '../../types';

const formatTemplate = (value: string, vars: Record<string, string>): string =>
  value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => vars[key] ?? '');

const fallbackSummary = (args: {
  consumedReservations: number;
  releasedReservations: number;
  consumedSummarySingular: string;
  consumedSummaryPlural: string;
  releasedSummarySingular: string;
  releasedSummaryPlural: string;
}): string => {
  const parts: string[] = [];
  if (args.consumedReservations > 0) {
    parts.push(
      formatTemplate(
        args.consumedReservations === 1 ? args.consumedSummarySingular : args.consumedSummaryPlural,
        { count: `${args.consumedReservations}` }
      ).trim()
    );
  }
  if (args.releasedReservations > 0) {
    parts.push(
      formatTemplate(
        args.releasedReservations === 1 ? args.releasedSummarySingular : args.releasedSummaryPlural,
        { count: `${args.releasedReservations}` }
      ).trim()
    );
  }
  return parts.join(', ').trim();
};

export const buildReservationReconciliationFeedback = (args: {
  language: LangCode;
  feedback?: ReservationReconciliationFeedbackConfig | null;
  baseMessage: string;
  consumedReservations: number;
  releasedReservations: number;
  fallbackMessage?: string;
  fallbackConsumedSummarySingular?: string;
  fallbackConsumedSummaryPlural?: string;
  fallbackReleasedSummarySingular?: string;
  fallbackReleasedSummaryPlural?: string;
}): string => {
  const consumedReservations = Math.max(0, Number(args.consumedReservations) || 0);
  const releasedReservations = Math.max(0, Number(args.releasedReservations) || 0);
  const fallbackConsumedSummarySingular = (args.fallbackConsumedSummarySingular || '{count} reservation consumed').trim();
  const fallbackConsumedSummaryPlural = (args.fallbackConsumedSummaryPlural || '{count} reservations consumed').trim();
  const fallbackReleasedSummarySingular = (args.fallbackReleasedSummarySingular || '{count} reservation released').trim();
  const fallbackReleasedSummaryPlural = (args.fallbackReleasedSummaryPlural || '{count} reservations released').trim();
  const fallbackMessage = (args.fallbackMessage || '{baseMessage} {reconciliationSummary}.').trim();

  const consumedTemplate = resolveLocalizedString(
    consumedReservations === 1 ? args.feedback?.consumedSummarySingular : args.feedback?.consumedSummaryPlural,
    args.language,
    consumedReservations === 1 ? fallbackConsumedSummarySingular : fallbackConsumedSummaryPlural
  ).trim();

  const releasedTemplate = resolveLocalizedString(
    releasedReservations === 1 ? args.feedback?.releasedSummarySingular : args.feedback?.releasedSummaryPlural,
    args.language,
    releasedReservations === 1 ? fallbackReleasedSummarySingular : fallbackReleasedSummaryPlural
  ).trim();

  const summaryParts: string[] = [];
  if (consumedReservations > 0) {
    summaryParts.push(formatTemplate(consumedTemplate, { count: `${consumedReservations}` }).trim());
  }
  if (releasedReservations > 0) {
    summaryParts.push(formatTemplate(releasedTemplate, { count: `${releasedReservations}` }).trim());
  }

  const reconciliationSummary = summaryParts.length ? summaryParts.join(', ') : fallbackSummary({
    consumedReservations,
    releasedReservations,
    consumedSummarySingular: fallbackConsumedSummarySingular,
    consumedSummaryPlural: fallbackConsumedSummaryPlural,
    releasedSummarySingular: fallbackReleasedSummarySingular,
    releasedSummaryPlural: fallbackReleasedSummaryPlural
  });

  if (!reconciliationSummary) return args.baseMessage;

  const messageTemplate = resolveLocalizedString(
    args.feedback?.message,
    args.language,
    fallbackMessage
  ).trim();

  const rendered = formatTemplate(messageTemplate, {
    baseMessage: args.baseMessage,
    reconciliationSummary,
    consumedReservations: `${consumedReservations}`,
    releasedReservations: `${releasedReservations}`
  }).trim();

  return rendered || `${args.baseMessage} ${reconciliationSummary}.`;
};
