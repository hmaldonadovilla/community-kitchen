import { buildGuidedLineGroupConfig } from '../../../src/web/react/features/steps/domain/guidedLineGroupConfig';

describe('guided line group config', () => {
  const groupQ: any = {
    id: 'MEALS',
    type: 'LINE_ITEM_GROUP',
    lineItemConfig: {
      fields: [
        { id: 'category', type: 'TEXT' },
        { id: 'qty', type: 'NUMBER' },
        { id: 'note', type: 'TEXT' }
      ],
      subGroups: [
        {
          id: 'ingredients',
          fields: [
            { id: 'name', type: 'TEXT' },
            { id: 'amount', type: 'NUMBER' }
          ]
        }
      ],
      ui: {}
    }
  };

  it('applies field allowlists, read-only fields, and subgroup field scopes', () => {
    const out = buildGuidedLineGroupConfig({
      groupQ,
      targetHelperText: '',
      stepLineGroupsDefaultMode: '',
      stepSubGroupsDefaultMode: '',
      target: {
        kind: 'lineGroup',
        id: 'MEALS',
        fields: ['qty', { id: 'category', renderAsLabel: true }],
        subGroups: {
          include: [{ id: 'ingredients', fields: ['amount'], readOnlyFields: ['amount'] }]
        }
      }
    });

    expect(out.effectiveLineMode).toBe('inline');
    expect(out.stepLineCfg.fields.map((field: any) => field.id)).toEqual(['qty', 'category']);
    expect(out.stepLineCfg.fields.find((field: any) => field.id === 'category')?.ui?.renderAsLabel).toBe(true);
    expect(out.stepLineCfg.subGroups[0].fields.map((field: any) => field.id)).toEqual(['amount']);
    expect(out.stepLineCfg.subGroups[0].fields[0].readOnly).toBe(true);
  });

  it('forces lifted row fields inline and hides add controls when row-filtered', () => {
    const out = buildGuidedLineGroupConfig({
      groupQ,
      targetHelperText: 'Use leftovers',
      stepLineGroupsDefaultMode: 'overlay',
      stepSubGroupsDefaultMode: 'overlay',
      target: {
        kind: 'lineGroup',
        id: 'MEALS',
        presentation: 'liftedRowFields',
        rows: { includeWhen: { fieldId: 'qty', greaterThan: 0 } },
        dataSourceRows: [{ presentation: 'sourceFirstAllocations' }]
      }
    });

    expect(out.presentation).toBe('liftedRowFields');
    expect(out.effectiveLineMode).toBe('inline');
    expect(out.hideInlineSubgroups).toBe(true);
    expect(out.delegateTargetHelperText).toBe(true);
    expect(out.stepLineCfg.ui.addButtonPlacement).toBe('hidden');
    expect(out.stepLineCfg.ui.showItemPill).toBe(false);
    expect(out.stepLineCfg.totals).toEqual([]);
  });
});
