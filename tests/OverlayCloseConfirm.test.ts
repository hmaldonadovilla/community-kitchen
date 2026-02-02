import { resolveOverlayCloseConfirm } from '../src/web/react/features/overlays/domain/overlayCloseConfirm';
import { resolveOverlayCloseDeletePlan } from '../src/web/react/features/overlays/domain/overlayCloseEffects';

describe('overlay close confirm', () => {
  test('resolves simple RowFlowActionConfirmConfig as-is', () => {
    const confirm = {
      title: { en: 'Confirm' },
      body: { en: 'Close?' },
      confirmLabel: { en: 'OK' },
      cancelLabel: { en: 'Cancel' }
    };
    const resolved = resolveOverlayCloseConfirm({
      closeConfirm: confirm as any,
      ctx: {
        getValue: () => undefined,
        getLineValue: () => undefined,
        getLineItems: () => [],
        getLineItemKeys: () => []
      }
    });
    expect(resolved?.source).toBe('simple');
    expect(resolved?.confirm).toEqual(confirm);
    expect(resolved?.onConfirmEffects || []).toHaveLength(0);
  });

  test('resolves first matching case with scoped subgroup lineItems clauses', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'req_1';
    const overlaySubId = 'MP_TYPE_LI';
    const overlayGroupKey = `${rootGroupId}::${rootRowId}::${overlaySubId}`;
    const overlayRowId = 'cook_1';
    const subId = 'MP_INGREDIENTS_LI';
    const subKey = `${overlayGroupKey}::${overlayRowId}::${subId}`;

    const closeConfirm = {
      allowCloseFromEdit: true,
      cases: [
        {
          when: {
            not: {
              lineItems: { groupId: rootGroupId, subGroupPath: [overlaySubId, subId], match: 'any' }
            }
          },
          title: { en: 'Missing ingredients' },
          body: { en: 'No ingredients have been added. Do you want to exit?' },
          confirmLabel: { en: 'Yes' },
          cancelLabel: { en: 'No' },
          validateOnReopen: true
        },
        {
          when: {
            lineItems: {
              groupId: rootGroupId,
              subGroupPath: [overlaySubId, subId],
              match: 'any',
              when: {
                all: [
                  { fieldId: 'ING', notEmpty: true },
                  { any: [{ fieldId: 'QTY', notEmpty: false }, { fieldId: 'UNIT', notEmpty: false }] }
                ]
              }
            }
          },
          title: { en: 'Missing quantity/unit' },
          body: { en: 'Missing qty/unit' },
          confirmLabel: { en: 'Close' },
          cancelLabel: { en: 'Continue' },
          highlightFirstError: true,
          validateOnReopen: true,
          onConfirmEffects: [
            {
              type: 'deleteLineItems',
              groupId: subId,
              rowFilter: {
                includeWhen: {
                  any: [{ fieldId: 'QTY', notEmpty: false }, { fieldId: 'UNIT', notEmpty: false }]
                }
              }
            }
          ]
        }
      ]
    };

    const ctx = {
      getValue: () => undefined,
      getLineValue: () => undefined,
      getLineItems: (key: string) => {
        if (key === rootGroupId) return [{ id: rootRowId, values: {} }];
        if (key === overlayGroupKey) return [{ id: overlayRowId, values: {} }];
        if (key === subKey) return [];
        return [];
      },
      getLineItemKeys: () => [rootGroupId, overlayGroupKey]
    };

    const resolvedEmpty = resolveOverlayCloseConfirm({
      closeConfirm: closeConfirm as any,
      ctx: ctx as any,
      scope: { rowId: overlayRowId, linePrefix: overlayGroupKey }
    });
    expect(resolvedEmpty?.confirm.title).toEqual({ en: 'Missing ingredients' });
    expect(resolvedEmpty?.validateOnReopen).toBe(true);
    expect(resolvedEmpty?.allowCloseFromEdit).toBe(true);

    const ctxMissing = {
      ...ctx,
      getLineItems: (key: string) => {
        if (key === rootGroupId) return [{ id: rootRowId, values: {} }];
        if (key === overlayGroupKey) return [{ id: overlayRowId, values: {} }];
        if (key === subKey)
          return [
            { id: 'i1', values: { ING: 'Carrot', QTY: '', UNIT: '' } },
            { id: 'i2', values: { ING: 'Onion', QTY: 1, UNIT: 'kg' } }
          ];
        return [];
      },
      getLineItemKeys: () => [rootGroupId, overlayGroupKey, subKey]
    };

    const resolvedMissing = resolveOverlayCloseConfirm({
      closeConfirm: closeConfirm as any,
      ctx: ctxMissing as any,
      scope: { rowId: overlayRowId, linePrefix: overlayGroupKey }
    });
    expect(resolvedMissing?.confirm.title).toEqual({ en: 'Missing quantity/unit' });
    expect(resolvedMissing?.highlightFirstError).toBe(true);
    expect(resolvedMissing?.onConfirmEffects?.length).toBe(1);
  });
});

describe('overlay close effects', () => {
  test('computes delete plan for subgroup rows using rowFilter', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'req_1';
    const overlaySubId = 'MP_TYPE_LI';
    const overlayGroupId = `${rootGroupId}::${rootRowId}::${overlaySubId}`;
    const parentRowId = 'cook_1';
    const subId = 'MP_INGREDIENTS_LI';
    const subKey = `${overlayGroupId}::${parentRowId}::${subId}`;

    const effects = [
      {
        type: 'deleteLineItems',
        groupId: subId,
        rowFilter: {
          includeWhen: {
            all: [
              { fieldId: 'ING', notEmpty: true },
              { any: [{ fieldId: 'QTY', notEmpty: false }, { fieldId: 'UNIT', notEmpty: false }] }
            ]
          }
        }
      }
    ];

    const plan = resolveOverlayCloseDeletePlan({
      effects: effects as any,
      overlayGroupId,
      overlayRowId: parentRowId,
      topValues: {},
      lineItems: {
        [rootGroupId]: [{ id: rootRowId, values: {} }],
        [overlayGroupId]: [{ id: parentRowId, values: {} }],
        [subKey]: [
          { id: 'i1', values: { ING: 'Carrot', QTY: '', UNIT: '' } },
          { id: 'i2', values: { ING: 'Onion', QTY: 1, UNIT: 'kg' } }
        ]
      } as any
    });

    expect(plan).toEqual([{ groupKey: subKey, rowIds: ['i1'] }]);
  });
});
