import {
  applyStepDataSourceDraftUpdateAction,
  buildStepDataSourceDraftValuesAction
} from '../../../src/web/react/components/form/stepDataSourceDrafts';

describe('step data-source draft helpers', () => {
  test('builds selected draft values from configured fields', () => {
    expect(
      buildStepDataSourceDraftValuesAction({
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        modeFieldId: 'mode',
        rowValues: {
          selected: false,
          quantity: '3',
          mode: 'reserve',
          ignored: 'value'
        }
      })
    ).toEqual({
      selected: true,
      quantity: '3',
      mode: 'reserve'
    });
  });

  test('omits blank mode values from draft values', () => {
    expect(
      buildStepDataSourceDraftValuesAction({
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        modeFieldId: 'mode',
        rowValues: {
          quantity: '3',
          mode: ''
        }
      })
    ).toEqual({
      selected: true,
      quantity: '3'
    });
  });

  test('returns previous draft map when selected draft is unchanged', () => {
    const previousDrafts = {
      draftA: {
        selected: true,
        quantity: '2'
      }
    };

    expect(
      applyStepDataSourceDraftUpdateAction({
        previousDrafts,
        draftKey: 'draftA',
        shouldSelect: true,
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        modeFieldId: '',
        rowValues: {
          quantity: '2'
        }
      })
    ).toBe(previousDrafts);
  });

  test('upserts changed selected draft values', () => {
    expect(
      applyStepDataSourceDraftUpdateAction({
        previousDrafts: {
          draftA: {
            selected: true,
            quantity: '2'
          }
        },
        draftKey: 'draftA',
        shouldSelect: true,
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        modeFieldId: '',
        rowValues: {
          quantity: '5'
        }
      })
    ).toEqual({
      draftA: {
        selected: true,
        quantity: '5'
      }
    });
  });

  test('removes unselected draft values only when present', () => {
    const previousDrafts = {
      draftA: {
        selected: true,
        quantity: '2'
      },
      draftB: {
        selected: true,
        quantity: '4'
      }
    };

    expect(
      applyStepDataSourceDraftUpdateAction({
        previousDrafts,
        draftKey: 'missing',
        shouldSelect: false,
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        modeFieldId: '',
        rowValues: {}
      })
    ).toBe(previousDrafts);

    expect(
      applyStepDataSourceDraftUpdateAction({
        previousDrafts,
        draftKey: 'draftA',
        shouldSelect: false,
        selectedFieldId: 'selected',
        quantityFieldId: 'quantity',
        modeFieldId: '',
        rowValues: {}
      })
    ).toEqual({
      draftB: {
        selected: true,
        quantity: '4'
      }
    });
  });
});
