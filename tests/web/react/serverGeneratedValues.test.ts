import {
  extractServerGeneratedTopValues,
  mergeServerGeneratedTopValues
} from '../../../src/web/react/app/serverGeneratedValues';

describe('serverGeneratedValues', () => {
  it('extracts non-empty auto increment values from save metadata', () => {
    expect(
      extractServerGeneratedTopValues({
        meta: {
          autoIncrementValues: {
            MP_ID: ' MP-AA000123 ',
            EMPTY: '',
            NIL: null
          }
        }
      })
    ).toEqual({ MP_ID: 'MP-AA000123' });
  });

  it('merges generated values into existing form values', () => {
    expect(mergeServerGeneratedTopValues({ MP_SERVICE: 'Lunch', MP_ID: '' } as any, { MP_ID: 'MP-AA000123' })).toEqual({
      MP_SERVICE: 'Lunch',
      MP_ID: 'MP-AA000123'
    });
  });
});
