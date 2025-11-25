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

export interface BootstrapOptions {
  onReady?: (definition: WebFormDefinition, formKey?: string) => void;
}

export function bootstrapWebForm(definition: WebFormDefinition, formKey?: string, opts?: BootstrapOptions): void {
  const initialLang = (definition.languages && definition.languages[0]) || ('EN' as LangCode);
  setState({ language: initialLang });
  if (opts?.onReady) opts.onReady(definition, formKey);
  // UI wiring will be added in subsequent steps; keep bootstrap lightweight and side-effect free.
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
    };
    __WEB_FORM_DEF__?: WebFormDefinition;
    __WEB_FORM_KEY__?: string;
  }
}

if (typeof window !== 'undefined') {
  window.WebFormApp = { ...(window.WebFormApp || {}), bootstrapWebForm };
  window.WebFormApp.updateLanguageLabels = updateLanguageLabels;
  window.WebFormApp.applyFiltersAndVisibility = (opts) => {
    const { definition, language, formEl, scopeRow } = opts;
    applyFilters({ definition, language, formEl, scopeRow });
    applyVisibility({ definition, language, formEl });
  };
  window.WebFormApp.validateFormWithBundle = validateFormWithBundle;
  window.WebFormApp.resolveFieldElement = resolveFieldElement;
  window.WebFormApp.computeLineTotals = computeTotals;
  window.WebFormApp.syncLineItemPayload = syncLineItemPayload;
  window.WebFormApp.buildPayloadFromForm = buildPayloadFromForm;
  window.WebFormApp.handleSelectionEffects = handleSelectionEffects;
  window.WebFormApp.hydrateDataSources = hydrateDataSources;
  window.WebFormApp.addLineItemRowFromBundle = addLineItemRowFromBundle;
  window.WebFormApp.computeLineItemTotalsLegacy = computeLineTotalsLegacy;
  window.WebFormApp.createViewRouter = createViewRouter;
  window.WebFormApp.renderListView = renderListView;
  window.WebFormApp.renderSummaryView = renderSummaryView;
  window.WebFormApp.renderFollowupView = renderFollowupView;
}
