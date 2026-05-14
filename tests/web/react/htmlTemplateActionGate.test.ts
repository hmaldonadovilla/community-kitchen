import { isHiddenHtmlTemplateUpdateRecordAction } from '../../../src/web/react/app/htmlTemplateActionGate';
import type { WebQuestionDefinition } from '../../../src/types';

const button: WebQuestionDefinition = {
  id: 'MP_OVERRIDE_EXP_DATE',
  type: 'BUTTON',
  label: { en: 'Override', fr: '', nl: '' },
  required: false,
  visibility: {
    showWhen: {
      all: [
        {
          fieldId: '__ckRequestParam_admin',
          equals: ['true', '1', 'yes', 'on']
        },
        {
          fieldId: 'status',
          notEquals: ['Final report emailed', 'Final report sent', 'Closed']
        }
      ]
    }
  }
};

describe('isHiddenHtmlTemplateUpdateRecordAction', () => {
  const originalRequestParams = (globalThis as any).__WEB_FORM_REQUEST_PARAMS__;

  afterEach(() => {
    (globalThis as any).__WEB_FORM_REQUEST_PARAMS__ = originalRequestParams;
  });

  it('allows admin html template update actions before the final report is sent', () => {
    (globalThis as any).__WEB_FORM_REQUEST_PARAMS__ = { admin: 'true' };

    expect(
      isHiddenHtmlTemplateUpdateRecordAction({
        button,
        action: 'updateRecord',
        source: 'htmlTemplate',
        values: {},
        lineItems: {},
        recordMeta: { status: 'In progress' }
      })
    ).toBe(false);
  });

  it('blocks admin html template update actions after the final report is sent', () => {
    (globalThis as any).__WEB_FORM_REQUEST_PARAMS__ = { admin: 'true' };

    expect(
      isHiddenHtmlTemplateUpdateRecordAction({
        button,
        action: 'updateRecord',
        source: 'htmlTemplate',
        values: {},
        lineItems: {},
        recordMeta: { status: 'Final report sent' }
      })
    ).toBe(true);
  });

  it('does not apply the gate to normal custom buttons', () => {
    expect(
      isHiddenHtmlTemplateUpdateRecordAction({
        button,
        action: 'updateRecord',
        source: 'summaryBar',
        values: {},
        lineItems: {},
        recordMeta: { status: 'Final report sent' }
      })
    ).toBe(false);
  });
});
