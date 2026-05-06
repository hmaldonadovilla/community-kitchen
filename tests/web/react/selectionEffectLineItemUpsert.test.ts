import { buildSelectionEffectLineItemUpsert } from '../../../src/web/react/app/selectionEffectLineItemUpsert';
import {
  ROW_HIDE_REMOVE_KEY,
  ROW_ID_KEY,
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY,
  ROW_SELECTION_EFFECT_ID_KEY
} from '../../../src/web/react/app/lineItems';
import type { LineItemRowState } from '../../../src/web/types';

describe('selectionEffectLineItemUpsert', () => {
  it('reports unchanged when the generated row already matches the requested effect state', () => {
    const rows: LineItemRowState[] = [
      {
        id: 'cook_1',
        values: {
          [ROW_ID_KEY]: 'cook_1',
          [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync',
          [ROW_HIDE_REMOVE_KEY]: true,
          [ROW_PARENT_GROUP_ID_KEY]: 'MEALS',
          [ROW_PARENT_ROW_ID_KEY]: 'meal_1',
          PREP_TYPE: 'Cook',
          PREP_QTY: 8
        },
        parentGroupId: 'MEALS',
        parentId: 'meal_1'
      }
    ];

    const result = buildSelectionEffectLineItemUpsert({
      rows,
      existingIdxs: [0],
      keepIdx: 0,
      presetValues: {
        [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync',
        [ROW_HIDE_REMOVE_KEY]: true,
        [ROW_PARENT_GROUP_ID_KEY]: 'MEALS',
        [ROW_PARENT_ROW_ID_KEY]: 'meal_1',
        PREP_TYPE: 'Cook',
        PREP_QTY: 8
      },
      parentGroupId: 'MEALS',
      parentRowId: 'meal_1'
    });

    expect(result.changed).toBe(false);
    expect(result.nextRows).toHaveLength(1);
    expect(result.nextRows[0]).toEqual(rows[0]);
  });

  it('updates the kept row and removes duplicate generated rows', () => {
    const rows: LineItemRowState[] = [
      {
        id: 'cook_1',
        values: {
          [ROW_ID_KEY]: 'cook_1',
          [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync',
          PREP_TYPE: 'Cook',
          PREP_QTY: 10
        }
      },
      {
        id: 'cook_2',
        values: {
          [ROW_ID_KEY]: 'cook_2',
          [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync',
          PREP_TYPE: 'Cook',
          PREP_QTY: 10
        }
      }
    ];

    const result = buildSelectionEffectLineItemUpsert({
      rows,
      existingIdxs: [0, 1],
      keepIdx: 0,
      presetValues: {
        [ROW_SELECTION_EFFECT_ID_KEY]: 'mp_to_cook_sync',
        PREP_TYPE: 'Cook',
        PREP_QTY: 6
      },
      parentGroupId: 'MEALS',
      parentRowId: 'meal_1'
    });

    expect(result.changed).toBe(true);
    expect(result.nextRows).toHaveLength(1);
    expect(result.nextRows[0].id).toBe('cook_1');
    expect(result.nextRows[0].parentGroupId).toBe('MEALS');
    expect(result.nextRows[0].parentId).toBe('meal_1');
    expect(result.nextRows[0].values.PREP_QTY).toBe(6);
  });
});
