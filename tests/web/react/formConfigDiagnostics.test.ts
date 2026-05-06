import {
  collectAddOverlayCopyGroups,
  collectGuidedRowFlowSegmentActionTargets,
  collectGuidedRowFlowTargets,
  collectLineItemDedupGroups,
  collectNonMatchWarningModeGroups,
  collectSelectorOverlayGroups,
  collectSelectorOverlayHelperGroups,
  resolveFoodSafetyDiagnosticPayloads
} from '../../../src/web/react/components/form/formConfigDiagnostics';

describe('form config diagnostics helpers', () => {
  test('collects line-item configuration diagnostic groups', () => {
    const questions = [
      {
        id: 'meals',
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          addMode: 'selector-overlay',
          sectionSelector: { helperTextEn: 'Choose a section' },
          addOverlay: { title: 'Add meal' },
          dedupRules: [{ fields: ['meal', 'customer'] }],
          ui: {
            nonMatchWarningMode: 'all',
            overlayDetail: { enabled: true }
          }
        }
      },
      {
        id: 'ignored',
        type: 'TEXT'
      }
    ] as any[];

    expect(collectSelectorOverlayGroups(questions)).toEqual(['meals']);
    expect(collectSelectorOverlayHelperGroups(questions)).toEqual(['meals']);
    expect(collectAddOverlayCopyGroups(questions)).toEqual(['meals']);
    expect(collectNonMatchWarningModeGroups(questions)).toEqual([{ id: 'meals', mode: 'both' }]);
    expect(collectLineItemDedupGroups(questions)).toEqual([{ id: 'meals', rules: [['meal', 'customer']] }]);
  });

  test('collects guided row-flow targets and output action counts', () => {
    const steps = [
      {
        id: 'portioning',
        include: [
          {
            kind: 'lineGroup',
            id: 'meals',
            rowFlow: {
              mode: 'progressive',
              output: {
                segments: [
                  { type: 'field', fieldRef: 'qty', editAction: 'editQty' },
                  { type: 'field', fieldRef: 'photo', editActions: ['open', 'replace'] },
                  { type: 'text', editAction: 'ignored' }
                ]
              }
            }
          },
          { kind: 'question', id: 'status' }
        ]
      }
    ];

    expect(collectGuidedRowFlowTargets(steps)).toEqual([
      { stepId: 'portioning', groupId: 'meals', mode: 'progressive' }
    ]);
    expect(collectGuidedRowFlowSegmentActionTargets(steps)).toEqual([
      { stepId: 'portioning', groupId: 'meals', segmentsWithActions: 2, multiActionSegments: 1 }
    ]);
  });

  test('builds food-safety diagnostic payloads when configured', () => {
    const payloads = resolveFoodSafetyDiagnosticPayloads({
      language: 'en',
      steps: [{ id: 'foodSafety', helpText: { en: 'Check temperatures.' } }],
      questions: [
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              { id: 'LEFTOVER_VAL', type: 'CHECKBOX' },
              { id: 'MP_COOK_TEMP', type: 'CHECKBOX' }
            ]
          }
        }
      ] as any[]
    });

    expect(payloads).toEqual({
      helperText: { stepId: 'foodSafety', enabled: true, length: 'Check temperatures.'.length },
      fields: {
        groupId: 'MP_MEALS_REQUEST',
        leftoverField: true,
        tempFieldType: 'CHECKBOX',
        tempConsent: true
      }
    });
  });
});
