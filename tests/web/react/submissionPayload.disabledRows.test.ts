import { buildSubmissionPayload } from '../../../src/web/react/app/submission';

describe('buildSubmissionPayload (disabled progressive rows)', () => {
  test('filters disabled progressive rows by default (saveDisabledRows=false)', async () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'LI',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Line items', fr: 'Lignes', nl: 'Rijen' },
          required: false,
          lineItemConfig: {
            ui: {
              mode: 'progressive',
              expandGate: 'collapsedFieldsValid',
              defaultCollapsed: true,
              collapsedFields: [{ fieldId: 'A', showLabel: true }],
              saveDisabledRows: false
            },
            fields: [
              {
                id: 'A',
                type: 'TEXT',
                labelEn: 'A',
                labelFr: 'A',
                labelNl: 'A',
                required: true,
                options: [],
                optionsFr: [],
                optionsNl: []
              }
            ]
          }
        }
      ]
    };

    const payload = await buildSubmissionPayload({
      definition,
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems: { LI: [{ id: 'r1', values: {} }] }
    });

    expect((payload as any).values.LI).toEqual([]);
    expect((payload as any).values['LI_json']).toBe('[]');
  });

  test('includes disabled progressive rows when saveDisabledRows=true', async () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'LI',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Line items', fr: 'Lignes', nl: 'Rijen' },
          required: false,
          lineItemConfig: {
            ui: {
              mode: 'progressive',
              expandGate: 'collapsedFieldsValid',
              defaultCollapsed: true,
              collapsedFields: [{ fieldId: 'A', showLabel: true }],
              saveDisabledRows: true
            },
            fields: [
              {
                id: 'A',
                type: 'TEXT',
                labelEn: 'A',
                labelFr: 'A',
                labelNl: 'A',
                required: true,
                options: [],
                optionsFr: [],
                optionsNl: []
              }
            ]
          }
        }
      ]
    };

    const payload = await buildSubmissionPayload({
      definition,
      formKey: 'FORM',
      language: 'EN',
      values: {},
      lineItems: { LI: [{ id: 'r1', values: {} }] }
    });

    expect(Array.isArray((payload as any).values.LI)).toBe(true);
    expect((payload as any).values.LI.length).toBe(1);
    expect((payload as any).values['LI_json']).toBe('[{}]');
  });
});


