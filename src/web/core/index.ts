// Shared form engine exports for both legacy and React UIs.
export { validateRules, evaluateRules, checkRule } from '../rules/validation';
export { shouldHideField, matchesWhen, matchesWhenClause, firstWhenFieldId } from '../rules/visibility';
export { computeAllowedOptions, buildLocalizedOptions } from '../rules/filter';
export { computeTotals, isEmptyRow } from '../lineItems';
export { handleSelectionEffects, SelectionEffectOptions } from '../effects/selectionEffects';
export { fetchDataSource, resolveQuestionOptionsFromSource } from '../data/dataSources';
export {
  normalizeLanguage,
  optionKey,
  toOptionSet,
  toDependencyValue,
  buildOptionSet,
  loadOptionsFromDataSource
} from './options';
