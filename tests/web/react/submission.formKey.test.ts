import {
  applyClientDataVersionToPayload,
  chainSerializedSubmissionRequest,
  isSubmissionStaleMessage,
  prepareClientDataVersionDispatch,
  resolveReservationPlanSourceMetaAdoption,
  resolveCurrentClientDataVersion,
  resolveDraftPayloadFormKey,
  settleClientDataVersionAfterDispatch,
  shouldApplyIncomingRecordSnapshot
} from '../../../src/web/react/app/submission';

describe('resolveDraftPayloadFormKey', () => {
  it('prefers the explicit form key over the destination tab context', () => {
    expect(
      resolveDraftPayloadFormKey({
        formKey: 'Config: Meal Production',
        definition: { title: 'Meal Production' } as any
      })
    ).toBe('Config: Meal Production');
  });

  it('falls back to the definition title when no explicit form key is provided', () => {
    expect(
      resolveDraftPayloadFormKey({
        formKey: '',
        definition: { title: 'Meal Production' } as any
      })
    ).toBe('Meal Production');
  });

  it('falls back to draft when no explicit form key or title is available', () => {
    expect(
      resolveDraftPayloadFormKey({
        formKey: '',
        definition: { title: '' } as any
      })
    ).toBe('draft');
  });
});

describe('applyClientDataVersionToPayload', () => {
  it('updates the payload to the latest client data version for the current record', () => {
    const payload: any = {
      formKey: 'Config: Meal Production',
      id: 'REC-1',
      values: {},
      __ckClientDataVersion: 1
    };

    const next = applyClientDataVersionToPayload({
      payload,
      currentRecordId: 'REC-1',
      currentDataVersion: 2
    }) as any;

    expect(next.__ckClientDataVersion).toBe(2);
  });

  it('removes a stale client data version when the payload targets another record', () => {
    const payload: any = {
      formKey: 'Config: Meal Production',
      id: 'REC-OLD',
      values: {},
      __ckClientDataVersion: 1
    };

    const next = applyClientDataVersionToPayload({
      payload,
      currentRecordId: 'REC-NEW',
      currentDataVersion: 2
    }) as any;

    expect(Object.prototype.hasOwnProperty.call(next, '__ckClientDataVersion')).toBe(false);
  });
});

describe('resolveCurrentClientDataVersion', () => {
  it('returns the highest positive version from mixed candidates', () => {
    expect(resolveCurrentClientDataVersion(null, 1, '2', undefined, 0, 'bad', 3)).toBe(3);
  });

  it('returns null when no positive candidate exists', () => {
    expect(resolveCurrentClientDataVersion(null, undefined, 0, -1, 'bad')).toBeNull();
  });
});

describe('prepareClientDataVersionDispatch', () => {
  it('advances the optimistic client version as soon as a request is dispatched', () => {
    const first = prepareClientDataVersionDispatch({
      payload: { formKey: 'Config: Meal Production', id: 'REC-1', values: {} } as any,
      currentRecordId: 'REC-1',
      currentDataVersion: 1
    });

    expect((first.payload as any).__ckClientDataVersion).toBe(1);
    expect(first.optimisticDataVersion).toBe(2);

    const second = prepareClientDataVersionDispatch({
      payload: { formKey: 'Config: Meal Production', id: 'REC-1', values: {} } as any,
      currentRecordId: 'REC-1',
      currentDataVersion: 1,
      optimisticDataVersion: first.optimisticDataVersion
    });

    expect((second.payload as any).__ckClientDataVersion).toBe(2);
    expect(second.optimisticDataVersion).toBe(3);
  });
});

describe('settleClientDataVersionAfterDispatch', () => {
  it('keeps the latest optimistic version after a successful response', () => {
    expect(
      settleClientDataVersionAfterDispatch({
        success: true,
        confirmedDataVersion: 1,
        optimisticDataVersion: 3,
        responseDataVersion: 3
      })
    ).toBe(3);
  });

  it('snaps back to the confirmed server version after a successful noop-style response', () => {
    expect(
      settleClientDataVersionAfterDispatch({
        success: true,
        confirmedDataVersion: 2,
        optimisticDataVersion: 3,
        responseDataVersion: 2
      })
    ).toBe(2);
  });

  it('falls back to the last confirmed version after a failed dispatch', () => {
    expect(
      settleClientDataVersionAfterDispatch({
        success: false,
        confirmedDataVersion: 2,
        optimisticDataVersion: 3
      })
    ).toBe(2);
  });
});

describe('resolveReservationPlanSourceMetaAdoption', () => {
  it('adopts matching source metadata when the reservation plan started from the current version', () => {
    expect(
      resolveReservationPlanSourceMetaAdoption({
        currentRecordId: 'REC-1',
        currentDataVersion: 109,
        fallbackRecordId: 'REC-1',
        result: {
          success: true,
          message: 'ok',
          sourceClientDataVersionMatched: true,
          sourceRecordMeta: {
            id: 'REC-1',
            dataVersion: 110,
            rowNumber: 42,
            updatedAt: '2026-04-16T00:00:00.000Z'
          }
        }
      })
    ).toEqual(
      expect.objectContaining({
        id: 'REC-1',
        dataVersion: 110,
        rowNumber: 42,
        updatedAt: '2026-04-16T00:00:00.000Z'
      })
    );
  });

  it('skips adoption when the reservation plan started from a stale client version', () => {
    expect(
      resolveReservationPlanSourceMetaAdoption({
        currentRecordId: 'REC-1',
        currentDataVersion: 109,
        fallbackRecordId: 'REC-1',
        result: {
          success: true,
          message: 'ok',
          sourceClientDataVersionMatched: false,
          sourceRecordMeta: {
            id: 'REC-1',
            dataVersion: 110
          }
        }
      })
    ).toBeNull();
  });
});

describe('isSubmissionStaleMessage', () => {
  it('detects optimistic locking errors', () => {
    expect(isSubmissionStaleMessage('This record was modified by another user. Please refresh.')).toBe(true);
    expect(isSubmissionStaleMessage('Save failed')).toBe(false);
  });
});

describe('shouldApplyIncomingRecordSnapshot', () => {
  it('rejects an older snapshot for the currently open record', () => {
    expect(
      shouldApplyIncomingRecordSnapshot({
        incomingRecordId: 'REC-1',
        currentRecordId: 'REC-1',
        incomingDataVersion: 1,
        currentDataVersion: 2
      })
    ).toBe(false);
  });

  it('accepts the same version for the current record', () => {
    expect(
      shouldApplyIncomingRecordSnapshot({
        incomingRecordId: 'REC-1',
        currentRecordId: 'REC-1',
        incomingDataVersion: 2,
        currentDataVersion: 2
      })
    ).toBe(true);
  });

  it('accepts snapshots for a different record even when the version is lower', () => {
    expect(
      shouldApplyIncomingRecordSnapshot({
        incomingRecordId: 'REC-2',
        currentRecordId: 'REC-1',
        incomingDataVersion: 1,
        currentDataVersion: 3
      })
    ).toBe(true);
  });
});

describe('chainSerializedSubmissionRequest', () => {
  it('waits for the previous request before running the next one', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>(resolve => {
      releaseFirst = () => {
        order.push('first:done');
        resolve();
      };
    });

    const second = chainSerializedSubmissionRequest(first, async () => {
      order.push('second:start');
      return 'ok';
    });

    await Promise.resolve();
    expect(order).toEqual([]);

    releaseFirst();
    await expect(second).resolves.toBe('ok');
    expect(order).toEqual(['first:done', 'second:start']);
  });

  it('continues after a failed previous request', async () => {
    const second = chainSerializedSubmissionRequest(Promise.reject(new Error('nope')), async () => 'ok');
    await expect(second).resolves.toBe('ok');
  });
});
