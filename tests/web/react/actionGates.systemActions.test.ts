import { buildSystemActionGateContext, evaluateSystemActionGate } from '../../../src/web/react/app/actionGates';

const pad2 = (n: number): string => n.toString().padStart(2, '0');
const formatLocalYmd = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

describe('system action gates', () => {
  it('matches submit disable gate using __ckView, __ckStep and isInFuture', () => {
    const tomorrow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return formatLocalYmd(d);
    })();

    const gates: any = {
      submit: [
        {
          id: 'futurePrepDate',
          when: {
            all: [
              { fieldId: '__ckView', equals: ['form'] },
              { fieldId: '__ckStep', equals: ['deliveryForm'] },
              { fieldId: 'MP_PREP_DATE', isInFuture: true }
            ]
          },
          disable: true
        }
      ]
    };

    const ctx = buildSystemActionGateContext({
      actionId: 'submit',
      view: 'form',
      values: { MP_PREP_DATE: tomorrow } as any,
      lineItems: {} as any,
      recordMeta: null,
      guidedVirtualState: {
        prefix: '__ckStep',
        activeStepId: 'deliveryForm',
        activeStepIndex: 1,
        maxValidIndex: -1,
        maxCompleteIndex: -1,
        steps: []
      } as any
    });

    const res = evaluateSystemActionGate({ gates, actionId: 'submit', ctx });
    expect(res.disabled).toBe(true);
    expect(res.hidden).toBe(false);
    expect(res.matchedRuleId).toBe('futurePrepDate');
  });

  it('matches submit hide gate on summary when status is Closed', () => {
    const gates: any = {
      submit: {
        id: 'hideClosedSubmit',
        when: { all: [{ fieldId: '__ckView', equals: ['summary'] }, { fieldId: 'status', equals: ['Closed'] }] },
        hide: true
      }
    };

    const ctx = buildSystemActionGateContext({
      actionId: 'submit',
      view: 'summary',
      values: {} as any,
      lineItems: {} as any,
      recordMeta: { status: 'Closed' } as any,
      guidedVirtualState: null
    });

    const res = evaluateSystemActionGate({ gates, actionId: 'submit', ctx });
    expect(res.hidden).toBe(true);
    expect(res.disabled).toBe(false);
    expect(res.matchedRuleId).toBe('hideClosedSubmit');
  });

  it('hides copyCurrentRecord when view is not summary or status is not Closed', () => {
    const gates: any = {
      copyCurrentRecord: [
        {
          id: 'onlyClosedSummary',
          when: {
            any: [
              { not: { fieldId: '__ckView', equals: ['summary'] } },
              { not: { fieldId: 'status', equals: ['Closed'] } }
            ]
          },
          hide: true
        }
      ]
    };

    const ctxSummaryOpen = buildSystemActionGateContext({
      actionId: 'copyCurrentRecord',
      view: 'summary',
      values: {} as any,
      lineItems: {} as any,
      recordMeta: { status: 'In progress' } as any,
      guidedVirtualState: null
    });
    expect(evaluateSystemActionGate({ gates, actionId: 'copyCurrentRecord', ctx: ctxSummaryOpen }).hidden).toBe(true);

    const ctxSummaryClosed = buildSystemActionGateContext({
      actionId: 'copyCurrentRecord',
      view: 'summary',
      values: {} as any,
      lineItems: {} as any,
      recordMeta: { status: 'Closed' } as any,
      guidedVirtualState: null
    });
    expect(evaluateSystemActionGate({ gates, actionId: 'copyCurrentRecord', ctx: ctxSummaryClosed }).hidden).toBe(false);
  });
});

