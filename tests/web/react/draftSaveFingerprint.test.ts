import {
  buildCompletedDraftSaveFingerprint,
  buildDraftSaveFingerprint,
  buildDraftStateFingerprint
} from '../../../src/web/react/app/draftSaveFingerprint';

describe('buildDraftSaveFingerprint', () => {
  test('returns the same fingerprint for equivalent draft payloads despite volatile client metadata', () => {
    const first = buildDraftSaveFingerprint({
      formKey: 'Config: Delivery',
      id: 'REC-1',
      language: 'EN',
      values: {
        status: 'In progress',
        Q1: 'Alice',
        GROUP_json: '[{"id":"r1"}]'
      },
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress',
      __ckClientDataVersion: 4
    });

    const second = buildDraftSaveFingerprint({
      id: 'REC-1',
      formKey: 'Config: Delivery',
      language: 'EN',
      values: {
        GROUP_json: '[{"id":"r1"}]',
        Q1: 'Alice',
        status: 'In progress'
      },
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress',
      __ckClientDataVersion: 5,
      updatedAt: '2026-04-08T10:00:00.000Z'
    });

    expect(first).toEqual(second);
  });

  test('returns null when the payload has no record id', () => {
    expect(
      buildDraftSaveFingerprint({
        formKey: 'Config: Delivery',
        values: { Q1: 'Alice' },
        __ckSaveMode: 'draft'
      })
    ).toBeNull();
  });

  test('builds a completed draft fingerprint using the server-confirmed record id', () => {
    const payload = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      values: {
        status: 'In progress',
        MP_MEALS_REQUEST_json: '[{"id":"meal-1"}]'
      },
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    };

    expect(buildCompletedDraftSaveFingerprint(payload, 'meal-production-1')).toEqual(
      buildDraftSaveFingerprint({
        ...payload,
        id: 'meal-production-1'
      })
    );
  });

  test('buildDraftStateFingerprint stays stable for equivalent form content', () => {
    const first = buildDraftStateFingerprint({
      formKey: 'Config: Delivery',
      language: 'EN',
      values: {
        Q1: 'Alice',
        status: 'In progress'
      },
      lineItems: {
        ITEMS: [{ id: 'r1', values: { NAME: 'Beans', QTY: 2 } }]
      }
    });

    const second = buildDraftStateFingerprint({
      language: 'EN',
      formKey: 'Config: Delivery',
      values: {
        status: 'In progress',
        Q1: 'Alice'
      },
      lineItems: {
        ITEMS: [{ values: { QTY: 2, NAME: 'Beans' }, id: 'r1' }]
      }
    });

    expect(first).toBe(second);
  });
});
