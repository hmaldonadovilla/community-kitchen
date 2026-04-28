import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';
import {
  bumpUploadFieldInvalidationVersion,
  getUploadFieldInvalidationVersion,
  resolveInvalidatedUploadFieldPathsFromDialogUpdates,
  wasUploadFieldInvalidated
} from '../../../src/web/react/app/uploadFieldInvalidation';

describe('uploadFieldInvalidation', () => {
  const definition: any = {
    questions: [
      { id: 'ING_EVD', type: 'FILE_UPLOAD' },
      { id: 'TEMP_EVD', type: 'FILE_UPLOAD' },
      { id: 'MP_COOK_TEMP', type: 'CHECKBOX', options: [] },
      {
        id: 'MP_MEALS_REQUEST',
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          fields: [],
          subGroups: [
            {
              id: 'MP_TYPE_LI',
              fields: [{ id: 'RECIPE', type: 'CHOICE' }]
            }
          ]
        }
      }
    ]
  };

  it('resolves cleared top and parent file uploads from dialog updates', () => {
    const groupId = buildSubgroupKey('MP_MEALS_REQUEST', 'meal-row-1', 'MP_TYPE_LI');
    const invalidated = resolveInvalidatedUploadFieldPathsFromDialogUpdates({
      definition,
      updates: [
        { target: { scope: 'top', fieldId: 'ING_EVD' }, value: [] },
        { target: { scope: 'top', fieldId: 'TEMP_EVD' }, value: [] },
        { target: { scope: 'top', fieldId: 'MP_COOK_TEMP' }, value: false }
      ],
      context: { scope: 'line', groupId, rowId: 'recipe-row-1' }
    });

    expect(invalidated).toEqual(['ING_EVD', 'TEMP_EVD']);
  });

  it('ignores non-empty upload updates', () => {
    const invalidated = resolveInvalidatedUploadFieldPathsFromDialogUpdates({
      definition,
      updates: [{ target: { scope: 'top', fieldId: 'ING_EVD' }, value: ['https://example.com/photo.jpg'] }],
      context: { scope: 'top' }
    });

    expect(invalidated).toEqual([]);
  });

  it('tracks invalidation versions per field path', () => {
    const versions = new Map<string, number>();

    expect(getUploadFieldInvalidationVersion(versions, 'ING_EVD')).toBe(0);

    const nextVersion = bumpUploadFieldInvalidationVersion(versions, 'ING_EVD');

    expect(nextVersion).toBe(1);
    expect(getUploadFieldInvalidationVersion(versions, 'ING_EVD')).toBe(1);
    expect(
      wasUploadFieldInvalidated({
        versions,
        fieldPath: 'ING_EVD',
        expectedVersion: 0
      })
    ).toBe(true);
    expect(
      wasUploadFieldInvalidated({
        versions,
        fieldPath: 'ING_EVD',
        expectedVersion: 1
      })
    ).toBe(false);
  });
});
