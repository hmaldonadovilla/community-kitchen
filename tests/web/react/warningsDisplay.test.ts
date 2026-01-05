import { collectValidationWarnings } from '../../../src/web/react/app/submission';

describe('collectValidationWarnings (warningDisplay)', () => {
  it('splits warnings into top and field buckets based on warningDisplay', () => {
    const definition: any = {
      questions: [
        {
          id: 'A',
          type: 'NUMBER',
          qEn: 'A',
          qFr: 'A',
          qNl: 'A',
          required: false,
          options: [],
          optionsFr: [],
          optionsNl: [],
          validationRules: [
            {
              level: 'warning',
              warningDisplay: 'field',
              when: { fieldId: 'A', lessThan: 63 },
              message: { en: 'warn-field' }
            },
            {
              level: 'warning',
              warningDisplay: 'top',
              when: { fieldId: 'A', lessThan: 63 },
              message: { en: 'warn-top' }
            },
            {
              level: 'warning',
              warningDisplay: 'both',
              when: { fieldId: 'A', lessThan: 63 },
              message: { en: 'warn-both' }
            }
          ]
        }
      ]
    };

    const res = collectValidationWarnings({
      definition,
      language: 'EN',
      values: { A: 60 },
      lineItems: {},
      phase: 'submit'
    });

    expect(res.top.map(t => t.message)).toEqual(expect.arrayContaining(['warn-top', 'warn-both']));
    expect(res.top.map(t => t.message)).not.toContain('warn-field');
    expect(res.byField.A).toEqual(expect.arrayContaining(['warn-field', 'warn-both']));
    expect(res.byField.A).not.toContain('warn-top');
  });

  it('filters warnings by warningView (edit vs summary vs both)', () => {
    const definition: any = {
      questions: [
        {
          id: 'A',
          type: 'NUMBER',
          qEn: 'A',
          qFr: 'A',
          qNl: 'A',
          required: false,
          options: [],
          optionsFr: [],
          optionsNl: [],
          validationRules: [
            {
              level: 'warning',
              warningDisplay: 'field',
              warningView: 'edit',
              when: { fieldId: 'A', lessThan: 63 },
              message: { en: 'warn-edit' }
            },
            {
              level: 'warning',
              warningDisplay: 'field',
              warningView: 'summary',
              when: { fieldId: 'A', lessThan: 63 },
              message: { en: 'warn-summary' }
            },
            {
              level: 'warning',
              warningDisplay: 'field',
              warningView: 'both',
              when: { fieldId: 'A', lessThan: 63 },
              message: { en: 'warn-both' }
            }
          ]
        }
      ]
    };

    const resEdit = collectValidationWarnings({
      definition,
      language: 'EN',
      values: { A: 60 },
      lineItems: {},
      phase: 'submit',
      uiView: 'edit'
    });
    expect(resEdit.byField.A).toEqual(expect.arrayContaining(['warn-edit', 'warn-both']));
    expect(resEdit.byField.A).not.toContain('warn-summary');

    const resSummary = collectValidationWarnings({
      definition,
      language: 'EN',
      values: { A: 60 },
      lineItems: {},
      phase: 'submit',
      uiView: 'summary'
    });
    expect(resSummary.byField.A).toEqual(expect.arrayContaining(['warn-summary', 'warn-both']));
    expect(resSummary.byField.A).not.toContain('warn-edit');
  });
});


