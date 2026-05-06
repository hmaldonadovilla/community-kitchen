import { applyStepDataSourceExclusiveSelectionRemovalAction } from '../../../src/web/react/features/lineItems/domain/stepDataSourceExclusiveSelection';

describe('step data-source exclusive selection helpers', () => {
  test('removes matching rows from the configured output group and cascades child rows', () => {
    const lineItems: any = {
      output: [
        { id: 'row-1', values: { LEFTOVER_ID: 'source-1' } },
        { id: 'row-2', values: { LEFTOVER_ID: 'source-2' } }
      ],
      child: [
        { id: 'child-1', parentId: 'row-1', parentGroupId: 'output', values: {} },
        { id: 'child-2', parentId: 'row-2', parentGroupId: 'output', values: {} }
      ]
    };

    const next = applyStepDataSourceExclusiveSelectionRemovalAction({
      lineItems,
      rootGroupId: 'root',
      outputGroupKey: 'output',
      outputGroupId: 'output',
      exclusiveSelectionKeyFieldId: 'LEFTOVER_ID',
      sourceKey: 'source-1',
      sameRootScope: false
    });

    expect(next.output.map((row: any) => row.id)).toEqual(['row-2']);
    expect(next.child.map((row: any) => row.id)).toEqual(['child-2']);
  });

  test('removes matching rows across same-root output groups only', () => {
    const lineItems: any = {
      'meals::parent-1::output': [
        { id: 'row-1', values: { LEFTOVER_ID: 'source-1' } }
      ],
      'meals::parent-2::output': [
        { id: 'row-2', values: { LEFTOVER_ID: 'source-1' } }
      ],
      'other::parent-3::output': [
        { id: 'row-3', values: { LEFTOVER_ID: 'source-1' } }
      ]
    };

    const next = applyStepDataSourceExclusiveSelectionRemovalAction({
      lineItems,
      rootGroupId: 'meals',
      outputGroupKey: 'unused',
      outputGroupId: 'output',
      exclusiveSelectionKeyFieldId: 'LEFTOVER_ID',
      sourceKey: 'source-1',
      sameRootScope: true
    });

    expect(next['meals::parent-1::output']).toEqual([]);
    expect(next['meals::parent-2::output']).toEqual([]);
    expect(next['other::parent-3::output']).toEqual([{ id: 'row-3', values: { LEFTOVER_ID: 'source-1' } }]);
  });

  test('returns the original state object when no rows match', () => {
    const lineItems: any = {
      output: [{ id: 'row-1', values: { LEFTOVER_ID: 'source-1' } }]
    };

    expect(
      applyStepDataSourceExclusiveSelectionRemovalAction({
        lineItems,
        rootGroupId: 'root',
        outputGroupKey: 'output',
        outputGroupId: 'output',
        exclusiveSelectionKeyFieldId: 'LEFTOVER_ID',
        sourceKey: 'missing',
        sameRootScope: false
      })
    ).toBe(lineItems);
  });
});
