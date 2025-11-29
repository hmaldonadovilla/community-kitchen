import { setState } from './state/store';
import { LangCode, WebFormDefinition } from './types';
import { updateLanguageLabels } from './legacy/language';
import { applyFilters } from './legacy/filters';
import { applyVisibility } from './legacy/visibility';
import { validateFormWithBundle, resolveFieldElement } from './legacy/validation';
import { syncLineItemPayload, buildPayloadFromForm } from './legacy/payload';
import { computeTotals } from './lineItems';
import { handleSelectionEffects } from './effects/selectionEffects';
import { hydrateDataSources } from './legacy/dataSources';
import { addLineItemRowFromBundle, computeLineItemTotals as computeLineTotalsLegacy } from './legacy/lineItems';
import { createViewRouter } from './views/router';
import { renderListView } from './views/listView';
import { renderSummaryView } from './views/summaryView';
import { renderFollowupView } from './views/followupView';
import { fetchSubmissionsPage } from './data/submissions';
import { submitWithDedup } from './data/submit';

export interface BootstrapOptions {
  onReady?: (definition: WebFormDefinition, formKey?: string) => void;
  mountListView?: HTMLElement;
  formMount?: HTMLElement;
}

export function bootstrapWebForm(definition: WebFormDefinition, formKey?: string, opts?: BootstrapOptions): void {
  const initialLang = definition.languages?.[0] || ('EN' as LangCode);
  setState({ language: initialLang });
  if (opts?.onReady) opts.onReady(definition, formKey);
  // Optionally render list view if a mount is provided
  if (opts?.mountListView) {
    renderListView({
      mount: opts.mountListView,
      definition,
      language: initialLang,
      fetchRows: (pageToken?: string) => fetchSubmissionsPage({ formKey, pageToken }),
      onSelectRow: (row) => {
        // set record meta to enable prefill in a downstream flow
        setState({ recordMeta: { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt } });
      }
    });
  }
  if (typeof console !== 'undefined') {
    console.info('[WebFormApp] bootstrapped', { formKey, language: initialLang });
  }
}

declare global {
  interface Window {
    WebFormApp?: {
      bootstrapWebForm: typeof bootstrapWebForm;
      updateLanguageLabels?: typeof updateLanguageLabels;
      applyFiltersAndVisibility?: (opts: {
        definition: WebFormDefinition;
        language: LangCode;
        formEl: HTMLFormElement;
        scopeRow?: HTMLElement | null;
      }) => void;
      validateFormWithBundle?: typeof validateFormWithBundle;
      resolveFieldElement?: typeof resolveFieldElement;
      computeLineTotals?: typeof computeTotals;
      syncLineItemPayload?: typeof syncLineItemPayload;
      buildPayloadFromForm?: typeof buildPayloadFromForm;
      handleSelectionEffects?: typeof handleSelectionEffects;
      hydrateDataSources?: typeof hydrateDataSources;
      addLineItemRowFromBundle?: typeof addLineItemRowFromBundle;
      computeLineItemTotalsLegacy?: typeof computeLineTotalsLegacy;
      createViewRouter?: typeof createViewRouter;
      renderListView?: typeof renderListView;
      renderSummaryView?: typeof renderSummaryView;
      renderFollowupView?: typeof renderFollowupView;
      fetchSubmissionsPage?: typeof fetchSubmissionsPage;
      submitWithDedup?: typeof submitWithDedup;
    };
    __WEB_FORM_DEF__?: WebFormDefinition;
    __WEB_FORM_KEY__?: string;
  }
}

const globalWindow: (Window & typeof globalThis) | undefined =
  typeof globalThis === 'object' && 'document' in globalThis
    ? (globalThis as Window & typeof globalThis)
    : undefined;

if (globalWindow) {
  const applyFiltersAndVisibility = (opts: {
    definition: WebFormDefinition;
    language: LangCode;
    formEl: HTMLFormElement;
    scopeRow?: HTMLElement | null;
  }) => {
    const { definition, language, formEl, scopeRow } = opts;
    applyFilters({ definition, language, formEl, scopeRow });
    applyVisibility({ definition, language, formEl });
  };

  const existingApp = globalWindow.WebFormApp || {};
  globalWindow.WebFormApp = {
    ...existingApp,
    bootstrapWebForm,
    updateLanguageLabels,
    applyFiltersAndVisibility,
    validateFormWithBundle,
    resolveFieldElement,
    computeLineTotals: computeTotals,
    syncLineItemPayload,
    buildPayloadFromForm,
    handleSelectionEffects,
    hydrateDataSources,
    addLineItemRowFromBundle,
    computeLineItemTotalsLegacy: computeLineTotalsLegacy,
    createViewRouter,
    renderListView,
    renderSummaryView,
    renderFollowupView,
    fetchSubmissionsPage,
    submitWithDedup,
  };
}
