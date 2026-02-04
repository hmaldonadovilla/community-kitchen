import { runSelectionEffects } from '../../src/web/react/app/selectionEffects';
import { WebFormDefinition } from '../../src/types';

describe('runSelectionEffects selectionEffect id tagging', () => {
  it('tags added rows with __ckSelectionEffectId when the effect declares id', () => {
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
            fields: [{ id: 'ITEM', type: 'TEXT', label: { en: 'Item', fr: 'Item', nl: 'Item' }, required: false }]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {};
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'TRIGGER',
        selectionEffects: [{ id: 'leftover', type: 'addLineItems', groupId: 'LINES', preset: { ITEM: 'Apple' } }]
      } as any,
      value: 'Yes',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems
    });

    const rows = lineItems['LINES'] || [];
    expect(rows.length).toBeGreaterThan(0);
    expect((rows[0].values as any).__ckSelectionEffectId).toBe('leftover');
  });

  it('does not seed subgroup rows when addLineItems creates a parent row (no presets)', () => {
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
            // Subgroup is NOT overlay/auto, so default behavior would be to seed an empty row unless explicitly suppressed.
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

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {};
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'TRIGGER',
        selectionEffects: [{ id: 'leftover', type: 'addLineItems', groupId: 'LINES', preset: { ITEM: 'Apple' } }]
      } as any,
      value: 'Yes',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems
    });

    const rows = lineItems['LINES'] || [];
    expect(rows.length).toBe(1);
    const subKey = `LINES::${rows[0].id}::SUB`;
    // We should not create an empty subgroup ROW; an empty array is fine (no presets were provided).
    expect(Array.isArray((lineItems as any)[subKey]) ? (lineItems as any)[subKey] : []).toEqual([]);
  });

  it('tags added rows with parent relationship metadata when triggered inside a line item row', () => {
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
            fields: [{ id: 'ITEM', type: 'TEXT', label: { en: 'Item', fr: 'Item', nl: 'Item' }, required: false }]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = { LINES: [{ id: 'p1', values: { ITEM: 'Parent' } }] };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'TRIGGER',
        selectionEffects: [{ id: 'leftover', type: 'addLineItems', groupId: 'LINES', preset: { ITEM: 'Child' }, hideRemoveButton: true }]
      } as any,
      value: 'Yes',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'LINES', rowId: 'p1', rowValues: { ITEM: 'Parent' } } }
    });

    const rows = lineItems['LINES'] || [];
    expect(rows.length).toBe(2);
    expect((rows[1].values as any).__ckParentGroupId).toBe('LINES');
    expect((rows[1].values as any).__ckParentRowId).toBe('p1');
    expect((rows[1].values as any).__ckHideRemove).toBe(true);
  });

  it('deletes effect-created child rows when selectionEffects.deleteLineItems triggers', () => {
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
            fields: [{ id: 'ITEM', type: 'TEXT', label: { en: 'Item', fr: 'Item', nl: 'Item' }, required: false }]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      LINES: [
        { id: 'p1', values: { ITEM: 'Parent' } },
        {
          id: 'c1',
          values: {
            ITEM: 'Child',
            __ckSelectionEffectId: 'leftover',
            __ckParentGroupId: 'LINES',
            __ckParentRowId: 'p1'
          }
        }
      ]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'TRIGGER',
        selectionEffects: [{ id: 'leftover', type: 'deleteLineItems', groupId: 'LINES', triggerValues: ['No'] }]
      } as any,
      value: 'No',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'LINES', rowId: 'p1', rowValues: { ITEM: 'Parent' } } }
    });

    const rows = lineItems['LINES'] || [];
    expect(rows.map((r: any) => r.id)).toEqual(['p1']);
  });

  it('deletes manually-added subgroup rows when selectionEffects.deleteLineItems triggers', () => {
    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [
        {
          id: 'PARENTS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Parents', fr: 'Parents', nl: 'Parents' },
          required: false,
          lineItemConfig: {
            fields: [{ id: 'NAME', type: 'TEXT', label: { en: 'Name', fr: 'Name', nl: 'Name' }, required: false }],
            subGroups: [
              {
                id: 'CHILD',
                label: { en: 'Child', fr: 'Child', nl: 'Child' },
                fields: [{ id: 'ITEM', type: 'TEXT', label: { en: 'Item', fr: 'Item', nl: 'Item' }, required: false }]
              }
            ]
          }
        } as any
      ]
    };

    let values: Record<string, any> = {};
    let lineItems: Record<string, any> = {
      PARENTS: [{ id: 'p1', values: { NAME: 'Parent' } }],
      'PARENTS::p1::CHILD': [
        { id: 'c1', values: { ITEM: 'One', __ckRowSource: 'manual' }, parentId: 'p1', parentGroupId: 'PARENTS' },
        { id: 'c2', values: { ITEM: 'Two', __ckRowSource: 'manual' }, parentId: 'p1', parentGroupId: 'PARENTS' }
      ]
    };
    const setValues = (next: any) => {
      values = typeof next === 'function' ? next(values) : next;
    };
    const setLineItems = (next: any) => {
      lineItems = typeof next === 'function' ? next(lineItems) : next;
    };

    runSelectionEffects({
      definition,
      question: {
        id: 'TRIGGER',
        selectionEffects: [{ type: 'deleteLineItems', groupId: 'CHILD' }]
      } as any,
      value: '1',
      language: 'EN' as any,
      values,
      lineItems,
      setValues,
      setLineItems,
      opts: { lineItem: { groupId: 'PARENTS', rowId: 'p1', rowValues: { NAME: 'Parent' } } }
    });

    expect(lineItems['PARENTS']?.map((r: any) => r.id)).toEqual(['p1']);
    expect(lineItems['PARENTS::p1::CHILD']).toEqual([]);
  });
});
