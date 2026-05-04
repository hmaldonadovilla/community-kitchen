import {
  applyUploadedFieldOverridesToState,
  type UploadedFieldValueOverride
} from '../../../src/web/react/features/uploads/domain/uploadedFieldOverrides';
import type { LineItemState } from '../../../src/web/react/types';
import type { FieldValue } from '../../../src/web/types';

const buildOverrideMap = (entries: Array<[string, UploadedFieldValueOverride]>): Map<string, UploadedFieldValueOverride> =>
  new Map(entries);

describe('uploadedFieldOverrides', () => {
  it('returns the original state references when there are no overrides', () => {
    const values: Record<string, FieldValue> = { title: 'Original' };
    const lineItems: LineItemState = {
      meals: [{ id: 'row-1', values: { photo: ['old-url'] } }]
    };

    const result = applyUploadedFieldOverridesToState({
      values,
      lineItems,
      overrides: new Map()
    });

    expect(result.values).toBe(values);
    expect(result.lineItems).toBe(lineItems);
  });

  it('applies top-level uploaded field values without mutating the original values', () => {
    const values: Record<string, FieldValue> = { name: 'Meal' };
    const lineItems: LineItemState = {};
    const uploadedItems = ['https://drive.example/photo.jpg'];

    const result = applyUploadedFieldOverridesToState({
      values,
      lineItems,
      overrides: buildOverrideMap([
        [
          'top-photo',
          {
            scope: 'top',
            questionId: 'PHOTO',
            items: uploadedItems
          }
        ]
      ])
    });

    expect(result.values).toEqual({
      name: 'Meal',
      PHOTO: uploadedItems
    });
    expect(result.values).not.toBe(values);
    expect(values).toEqual({ name: 'Meal' });
    expect(result.lineItems).toBe(lineItems);
  });

  it('applies line-item uploaded field values to the target row only', () => {
    const values: Record<string, FieldValue> = {};
    const rowOne = { id: 'row-1', values: { photo: ['old-url'], recipe: 'Chili' } };
    const rowTwo = { id: 'row-2', values: { photo: ['other-url'], recipe: 'Soup' } };
    const lineItems: LineItemState = {
      production: [rowOne, rowTwo]
    };
    const uploadedItems = ['https://drive.example/new-photo.jpg'];

    const result = applyUploadedFieldOverridesToState({
      values,
      lineItems,
      overrides: buildOverrideMap([
        [
          'line-photo',
          {
            scope: 'line',
            groupId: 'production',
            rowId: 'row-1',
            fieldId: 'photo',
            items: uploadedItems
          }
        ]
      ])
    });

    expect(result.values).toBe(values);
    expect(result.lineItems).not.toBe(lineItems);
    expect(result.lineItems.production).not.toBe(lineItems.production);
    expect(result.lineItems.production[0]).not.toBe(rowOne);
    expect(result.lineItems.production[0].values).toEqual({
      photo: uploadedItems,
      recipe: 'Chili'
    });
    expect(result.lineItems.production[1]).toBe(rowTwo);
    expect(lineItems.production[0].values.photo).toEqual(['old-url']);
  });

  it('ignores incomplete override descriptors', () => {
    const values: Record<string, FieldValue> = { name: 'Meal' };
    const lineItems: LineItemState = {
      production: [{ id: 'row-1', values: { photo: ['old-url'] } }]
    };

    const result = applyUploadedFieldOverridesToState({
      values,
      lineItems,
      overrides: buildOverrideMap([
        [
          'missing-question',
          {
            scope: 'top',
            items: ['https://drive.example/top.jpg']
          }
        ],
        [
          'missing-row-id',
          {
            scope: 'line',
            groupId: 'production',
            fieldId: 'photo',
            items: ['https://drive.example/line.jpg']
          }
        ]
      ])
    });

    expect(result.values).toBe(values);
    expect(result.lineItems).toBe(lineItems);
  });
});
