import {
  applyClientDataVersionToPayload,
  chainSerializedSubmissionRequest,
  resolveCurrentClientDataVersion,
  resolveDraftPayloadFormKey
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
