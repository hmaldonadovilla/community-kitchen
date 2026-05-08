import { buildSuccessfulSubmissionSnapshot } from '../../../src/web/react/app/submissionSnapshotState';

describe('submissionSnapshotState', () => {
  test('merges successful save metadata and payload values into the active snapshot', () => {
    const snapshot = buildSuccessfulSubmissionSnapshot({
      currentSnapshot: {
        id: 'record-1',
        formKey: 'Config: Meal Production',
        language: 'EN',
        values: {
          status: 'In progress',
          MP_PREP_DATE: '2026-05-08',
          MP_MEALS_REQUEST_json: '[{\"id\":\"old\"}]'
        },
        createdAt: '2026-05-08T08:00:00.000Z',
        updatedAt: '2026-05-08T08:00:00.000Z',
        status: 'In progress',
        dataVersion: 12,
        __rowNumber: 265
      } as any,
      recordId: 'record-1',
      values: {
        MP_MEALS_REQUEST_json: '[{\"id\":\"new\"}]'
      },
      status: 'In progress',
      updatedAt: '2026-05-08T09:00:00.000Z',
      dataVersion: 13,
      rowNumber: 265
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        id: 'record-1',
        updatedAt: '2026-05-08T09:00:00.000Z',
        dataVersion: 13,
        __rowNumber: 265,
        values: expect.objectContaining({
          status: 'In progress',
          MP_PREP_DATE: '2026-05-08',
          MP_MEALS_REQUEST_json: '[{\"id\":\"new\"}]'
        })
      })
    );
  });

  test('ignores metadata for a different active record', () => {
    const snapshot = buildSuccessfulSubmissionSnapshot({
      currentSnapshot: {
        id: 'record-1',
        formKey: 'Config: Meal Production',
        language: 'EN',
        values: {},
        createdAt: '',
        updatedAt: ''
      } as any,
      recordId: 'record-2',
      values: { status: 'In progress' }
    });

    expect(snapshot).toBeNull();
  });
});
