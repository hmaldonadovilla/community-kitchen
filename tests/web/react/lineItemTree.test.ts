import {
  buildLineItemOverlayGroupOverride,
  serializeLineItemTree
} from '../../../src/web/react/app/lineItemTree';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';
import { LineItemState } from '../../../src/web/react/types';

describe('serializeLineItemTree', () => {
  it('builds an overlay group override with merged ui and nested overlay detail config', () => {
    const group: any = {
      id: 'ROOT',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [{ id: 'ITEM' }],
        ui: {
          overlayDetail: {
            header: { title: 'Base' },
            body: { edit: { mode: 'base' }, view: { mode: 'view' } }
          }
        },
        addOverlay: { title: 'Base add' }
      }
    };

    const override = buildLineItemOverlayGroupOverride(group, {
      ui: {
        overlayDetail: {
          header: { subtitle: 'Override' },
          body: { edit: { mode: 'override' } }
        }
      } as any,
      addOverlay: { helperText: 'Override helper' } as any
    });

    expect(override?.id).toBe('ROOT');
    expect(override?.lineItemConfig?.fields).toEqual([{ id: 'ITEM' }]);
    expect((override?.lineItemConfig as any)?.ui.overlayDetail).toEqual({
      header: { title: 'Base', subtitle: 'Override' },
      body: {
        edit: { mode: 'override' },
        view: { mode: 'view' }
      },
      rowActions: {}
    });
    expect((override?.lineItemConfig as any)?.addOverlay).toEqual({
      title: 'Base add',
      helperText: 'Override helper'
    });
  });

  it('preserves nested subgroup rows when the active subgroup uses an override config', () => {
    const lineItems: LineItemState = {
      ROOT: [{ id: 'meal-1', values: { MEAL_TYPE: 'Diabetic' } }],
      [buildSubgroupKey('ROOT', 'meal-1', 'CHILD')]: [{ id: 'prep-1', values: { RECIPE: 'Garlic green beans' } }],
      [buildSubgroupKey(buildSubgroupKey('ROOT', 'meal-1', 'CHILD'), 'prep-1', 'INGS')]: [
        { id: 'ing-1', values: { ING: 'Green beans - frozen', QTY: 1.2, UNIT: 'bag' } },
        { id: 'ing-2', values: { ING: 'Salt', QTY: 3, UNIT: 'Tbsp' } }
      ]
    } as any;

    const rootConfig = {
      subGroups: [
        {
          id: 'CHILD',
          fields: [{ id: 'RECIPE' }]
        }
      ]
    };

    const withoutOverride = serializeLineItemTree({
      lineItems,
      groupCfg: rootConfig,
      groupKey: 'ROOT',
      rowFilters: {
        ROOT: 'meal-1',
        [buildSubgroupKey('ROOT', 'meal-1', 'CHILD')]: 'prep-1'
      }
    });

    expect(withoutOverride[0]?.CHILD?.[0]?.INGS).toBeUndefined();

    const withOverride = serializeLineItemTree({
      lineItems,
      groupCfg: rootConfig,
      groupKey: 'ROOT',
      rowFilters: {
        ROOT: 'meal-1',
        [buildSubgroupKey('ROOT', 'meal-1', 'CHILD')]: 'prep-1'
      },
      groupOverridesByKey: {
        [buildSubgroupKey('ROOT', 'meal-1', 'CHILD')]: {
          id: 'CHILD',
          fields: [{ id: 'RECIPE' }] as any,
          subGroups: [
            {
              id: 'INGS',
              fields: [{ id: 'ING' }, { id: 'QTY' }, { id: 'UNIT' }]
            } as any
          ]
        }
      }
    });

    expect(withOverride[0]?.CHILD?.[0]?.INGS).toEqual([
      expect.objectContaining({ ING: 'Green beans - frozen', QTY: 1.2, UNIT: 'bag' }),
      expect.objectContaining({ ING: 'Salt', QTY: 3, UNIT: 'Tbsp' })
    ]);
  });

  it('omits transient subgroups from serialized output', () => {
    const lineItems: LineItemState = {
      ROOT: [{ id: 'meal-1', values: { MEAL_TYPE: 'Diabetic' } }],
      [buildSubgroupKey('ROOT', 'meal-1', 'TRANSIENT')]: [
        { id: 'tmp-1', values: { LEFTOVER_ID: 'LE-1', LEFTOVER_SELECTED: true } }
      ]
    } as any;

    const rootConfig = {
      subGroups: [
        {
          id: 'TRANSIENT',
          ui: { persistRows: false },
          fields: [{ id: 'LEFTOVER_ID' }, { id: 'LEFTOVER_SELECTED' }]
        }
      ]
    };

    const serialized = serializeLineItemTree({
      lineItems,
      groupCfg: rootConfig,
      groupKey: 'ROOT'
    });

    expect(serialized[0]?.TRANSIENT).toBeUndefined();
  });
});
