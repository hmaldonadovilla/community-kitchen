import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';
import {
  resolveRowFlowActiveFieldMetaAction,
  resolveRowFlowGroupConfigAction
} from '../../../src/web/react/features/lineItems/domain/rowFlowGroupConfig';

describe('row flow group config domain', () => {
  test('resolves root, subgroup, and current subgroup configs', () => {
    const itemConfig = { id: 'items', fields: [{ id: 'item' }] };
    const packageConfig = { id: 'packages', fields: [{ id: 'package' }], subGroups: [itemConfig] };
    const rootConfig = { fields: [{ id: 'meal' }], subGroups: [packageConfig] };
    const definitionQuestions: any[] = [{ id: 'meals', type: 'LINE_ITEM_GROUP', lineItemConfig: rootConfig }];
    const packageKey = buildSubgroupKey('meals', 'row1', 'packages');
    const nestedKey = buildSubgroupKey(packageKey, 'row2', 'items');

    expect(
      resolveRowFlowGroupConfigAction({
        groupKey: 'meals',
        currentGroupId: 'meals',
        currentLineItemConfig: rootConfig,
        definitionQuestions
      })
    ).toEqual({ groupId: 'meals', config: rootConfig });

    expect(
      resolveRowFlowGroupConfigAction({
        groupKey: packageKey,
        currentGroupId: 'meals',
        currentLineItemConfig: rootConfig,
        definitionQuestions
      })
    ).toEqual({ groupId: packageKey, config: packageConfig });

    expect(
      resolveRowFlowGroupConfigAction({
        groupKey: nestedKey,
        currentGroupId: packageKey,
        currentLineItemConfig: packageConfig,
        definitionQuestions
      })
    ).toEqual({ groupId: nestedKey, config: itemConfig });
  });

  test('resolves active row-flow field metadata from an active element', () => {
    const activeElement = {
      closest: () => ({ dataset: { fieldPath: 'meals__quantity__row1' } })
    };

    expect(
      resolveRowFlowActiveFieldMetaAction({
        activeElement,
        resolveGroupConfig: groupKey => (groupKey === 'meals' ? { groupId: 'meals', config: {} } : null),
        resolveFieldConfig: (_groupKey, fieldId) => (fieldId === 'quantity' ? { id: 'quantity', type: 'number' } : null)
      })
    ).toEqual({ path: 'meals__quantity__row1', type: 'NUMBER' });

    expect(
      resolveRowFlowActiveFieldMetaAction({
        activeElement: { closest: () => ({ dataset: { fieldPath: 'bad' } }) },
        resolveGroupConfig: () => null,
        resolveFieldConfig: () => null
      })
    ).toEqual({ path: '', type: '' });
  });
});
