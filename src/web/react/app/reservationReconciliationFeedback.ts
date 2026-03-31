import type { ReservationReconciliationFeedbackConfig } from '../../../types';
import { resolveLocalizedString } from '../../i18n';
import type { LangCode } from '../../types';

const formatTemplate = (value: string, vars: Record<string, string>): string =>
  value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => vars[key] ?? '');

const fallbackSummary = (args: { consumedReservations: number; releasedReservations: number }): string => {
  const parts: string[] = [];
  if (args.consumedReservations > 0) {
    parts.push(
      `${args.consumedReservations} leftover reservation${args.consumedReservations === 1 ? '' : 's'} consumed`
    );
  }
  if (args.releasedReservations > 0) {
    parts.push(
      `${args.releasedReservations} leftover reservation${args.releasedReservations === 1 ? '' : 's'} released`
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
}): string => {
  const consumedReservations = Math.max(0, Number(args.consumedReservations) || 0);
  const releasedReservations = Math.max(0, Number(args.releasedReservations) || 0);

  const consumedTemplate = resolveLocalizedString(
    consumedReservations === 1 ? args.feedback?.consumedSummarySingular : args.feedback?.consumedSummaryPlural,
    args.language,
    consumedReservations === 1 ? '{count} leftover reservation consumed' : '{count} leftover reservations consumed'
  ).trim();

  const releasedTemplate = resolveLocalizedString(
    releasedReservations === 1 ? args.feedback?.releasedSummarySingular : args.feedback?.releasedSummaryPlural,
    args.language,
    releasedReservations === 1 ? '{count} leftover reservation released' : '{count} leftover reservations released'
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
    releasedReservations
  });

  if (!reconciliationSummary) return args.baseMessage;

  const messageTemplate = resolveLocalizedString(
    args.feedback?.message,
    args.language,
    '{baseMessage} {reconciliationSummary}.'
  ).trim();

  const rendered = formatTemplate(messageTemplate, {
    baseMessage: args.baseMessage,
    reconciliationSummary,
    consumedReservations: `${consumedReservations}`,
    releasedReservations: `${releasedReservations}`
  }).trim();

  return rendered || `${args.baseMessage} ${reconciliationSummary}.`;
};
