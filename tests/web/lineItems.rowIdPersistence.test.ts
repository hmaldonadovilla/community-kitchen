import { buildInitialLineItems } from '../../src/web/react/app/lineItems';
import { WebFormDefinition } from '../../src/types';

describe('buildInitialLineItems row id persistence', () => {
  it('uses __ckRowId when present for parent rows and subgroup rows', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Lines', fr: 'Lines', nl: 'Lines' },
          required: false,
          lineItemConfig: {
            fields: [{ id: 'ITEM', type: 'TEXT', label: { en: 'Item', fr: 'Item', nl: 'Item' }, required: false }],
            subGroups: [
              {
                id: 'SUB',
                label: { en: 'Sub', fr: 'Sub', nl: 'Sub' },
                fields: [{ id: 'A', type: 'TEXT', label: { en: 'A', fr: 'A', nl: 'A' }, required: false }]
              }
            ]
          }
        } as any
      ]
    };

    const recordValues: any = {
      LINES: [
        {
          __ckRowId: 'p1',
          ITEM: 'Parent',
          SUB: [{ __ckRowId: 'c1', A: 'Child' }]
        }
      ]
    };

    const state = buildInitialLineItems(definition, recordValues);

    expect(Array.isArray((state as any).LINES)).toBe(true);
    expect((state as any).LINES[0].id).toBe('p1');
    expect((state as any).LINES[0].values.__ckRowId).toBe('p1');

    const subKey = 'LINES::p1::SUB';
    expect(Array.isArray((state as any)[subKey])).toBe(true);
    expect((state as any)[subKey][0].id).toBe('c1');
    expect((state as any)[subKey][0].values.__ckRowId).toBe('c1');
  });
});

