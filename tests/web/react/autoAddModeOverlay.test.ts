import { reconcileOverlayAutoAddModeGroups, reconcileOverlayAutoAddModeSubgroups } from '../../../src/web/react/app/autoAddModeOverlay';
import { ROW_SOURCE_AUTO, ROW_SOURCE_KEY, ROW_SELECTION_EFFECT_ID_KEY, buildSubgroupKey } from '../../../src/web/react/app/lineItems';

describe('autoAddMode overlay reconciliation', () => {
  it('reconciles openInOverlay group auto rows from controlling field changes without opening overlay', () => {
    const ensureLineOptions = jest.fn();

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'ING_GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            addMode: 'auto',
            anchorFieldId: 'ING',
            ui: { openInOverlay: true },
            fields: [
              {
                id: 'ING',
                type: 'CHOICE',
                options: ['Chicken', 'Carrot'],
                optionFilter: {
                  dependsOn: 'DISH_TYPE',
                  optionMap: {
                    Standard: ['Chicken'],
                    Vegetarian: ['Carrot'],
                    '*': []
                  }
                }
              }
            ]
          }
        }
      ]
    };

    const base = reconcileOverlayAutoAddModeGroups({
      definition,
      values: { DISH_TYPE: 'Vegetarian' },
      lineItems: {},
      optionState: {},
      language: 'EN',
      ensureLineOptions
    });

    expect(base.changed).toBe(true);
    expect(ensureLineOptions).toHaveBeenCalledTimes(1);
    expect(base.lineItems.ING_GROUP).toBeDefined();
    expect(base.lineItems.ING_GROUP.length).toBe(1);
    expect((base.lineItems.ING_GROUP[0] as any).values.ING).toBe('Carrot');
    expect((base.lineItems.ING_GROUP[0] as any).values[ROW_SOURCE_KEY]).toBe(ROW_SOURCE_AUTO);

    const next = reconcileOverlayAutoAddModeGroups({
      definition,
      values: { DISH_TYPE: 'Standard' },
      lineItems: base.lineItems,
      optionState: {},
      language: 'EN',
      ensureLineOptions
    });

    expect(next.changed).toBe(true);
    expect(next.lineItems.ING_GROUP.length).toBe(1);
    expect((next.lineItems.ING_GROUP[0] as any).values.ING).toBe('Chicken');
  });

  it('reconciles openInOverlay subgroup auto rows per parent row', () => {
    const ensureLineOptions = jest.fn();

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'PARENT',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            ui: { openInOverlay: true },
            fields: [{ id: 'X', type: 'TEXT' }],
            subGroups: [
              {
                id: 'SUB',
                addMode: 'auto',
                anchorFieldId: 'SUB_ING',
                fields: [
                  {
                    id: 'SUB_ING',
                    type: 'CHOICE',
                    options: ['Chicken', 'Carrot'],
                    optionFilter: {
                      dependsOn: 'DISH_TYPE',
                      optionMap: {
                        Standard: ['Chicken'],
                        Vegetarian: ['Carrot'],
                        '*': []
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    const parentRows: any[] = [{ id: 'r1', values: {} }];
    const lineItems: any = { PARENT: parentRows };
    const subKey = buildSubgroupKey('PARENT', 'r1', 'SUB');

    const res = reconcileOverlayAutoAddModeSubgroups({
      definition,
      values: { DISH_TYPE: 'Vegetarian' },
      lineItems,
      optionState: {},
      language: 'EN',
      subgroupSelectors: {},
      ensureLineOptions
    });

    expect(res.changed).toBe(true);
    expect(res.lineItems[subKey]).toBeDefined();
    expect(res.lineItems[subKey].length).toBe(1);
    expect((res.lineItems[subKey][0] as any).values.SUB_ING).toBe('Carrot');
  });

  it('does not remove selection-effect auto rows while reconciling overlay auto rows', () => {
    const ensureLineOptions = jest.fn();

    const definition: any = {
      title: 'F',
      destinationTab: 'T',
      languages: ['EN'],
      questions: [
        {
          id: 'ING_GROUP',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            addMode: 'auto',
            anchorFieldId: 'ING',
            ui: { openInOverlay: true },
            fields: [
              {
                id: 'ING',
                type: 'CHOICE',
                options: ['Chicken', 'Carrot'],
                optionFilter: {
                  dependsOn: 'DISH_TYPE',
                  optionMap: {
                    Standard: ['Chicken'],
                    Vegetarian: ['Carrot'],
                    '*': []
                  }
                }
              }
            ]
          }
        }
      ]
    };

    const contextId = '__autoAddMode__:ING_GROUP:Vegetarian';
    const lineItems: any = {
      ING_GROUP: [
        {
          id: 'auto_row',
          values: { ING: 'Carrot', [ROW_SOURCE_KEY]: ROW_SOURCE_AUTO },
          autoGenerated: true,
          effectContextId: contextId
        },
        {
          id: 'selection_row',
          values: {
            ING: 'Chicken',
            [ROW_SOURCE_KEY]: ROW_SOURCE_AUTO,
            [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync'
          },
          autoGenerated: true,
          effectContextId: 'ING_GROUP::row::ING'
        }
      ]
    };

    const res = reconcileOverlayAutoAddModeGroups({
      definition,
      values: { DISH_TYPE: 'Vegetarian' },
      lineItems,
      optionState: {},
      language: 'EN',
      ensureLineOptions
    });

    expect(res.changed).toBe(false);
    expect(res.lineItems.ING_GROUP).toHaveLength(2);
    expect(res.lineItems.ING_GROUP.map((row: any) => row.id)).toEqual(['auto_row', 'selection_row']);
  });
});
