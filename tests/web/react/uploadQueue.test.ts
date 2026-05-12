import {
  buildUploadQueueKey,
  resolveUploadQueueBusyState,
  shouldAutosaveAfterUploadQueueDrained
} from '../../../src/web/react/app/uploadQueue';

describe('uploadQueue helpers', () => {
  it('builds stable per-record-session field queue keys', () => {
    expect(buildUploadQueueKey({ sessionId: 4, fieldPath: 'PHOTO' })).toBe('record:4:PHOTO');
    expect(buildUploadQueueKey({ sessionId: 'bad', fieldPath: 'PHOTO' })).toBe('record:0:PHOTO');
  });

  it('derives blocking queue count and first custom busy message', () => {
    const blockingByKey = new Map([
      ['record:1:PHOTO_A', false],
      ['record:1:PHOTO_B', true],
      ['record:1:PHOTO_C', true]
    ]);
    const busyMessageByKey = new Map([
      ['record:1:PHOTO_C', 'Wait for photo C'],
      ['record:1:PHOTO_B', 'Wait for photo B']
    ]);
    const busyTitleByKey = new Map([
      ['record:1:PHOTO_C', 'Photo C'],
      ['record:1:PHOTO_B', '']
    ]);

    expect(
      resolveUploadQueueBusyState({
        uploadQueueSize: 3,
        blockingByKey,
        busyTitleByKey,
        busyMessageByKey,
        defaultBusyTitle: 'Default title',
        defaultBusyMessage: 'Default wait'
      })
    ).toEqual({
      uploadsInFlight: 3,
      blockingUploadsInFlight: 2,
      busyTitle: '',
      busyMessage: 'Wait for photo B'
    });
  });

  it('falls back to the default busy message when no blocking upload has custom copy', () => {
    expect(
      resolveUploadQueueBusyState({
        uploadQueueSize: 1,
        blockingByKey: new Map([['record:1:PHOTO', true]]),
        busyTitleByKey: new Map(),
        busyMessageByKey: new Map(),
        defaultBusyTitle: 'Please wait',
        defaultBusyMessage: 'Please wait'
      })
    ).toEqual({
      uploadsInFlight: 1,
      blockingUploadsInFlight: 1,
      busyTitle: 'Please wait',
      busyMessage: 'Please wait'
    });
  });

  it('runs autosave only after the queue drains with dirty queued work', () => {
    expect(
      shouldAutosaveAfterUploadQueueDrained({
        uploadQueueSize: 0,
        autoSaveQueued: true,
        autoSaveDirty: true,
        submitting: false
      })
    ).toBe(true);

    expect(
      shouldAutosaveAfterUploadQueueDrained({
        uploadQueueSize: 1,
        autoSaveQueued: true,
        autoSaveDirty: true,
        submitting: false
      })
    ).toBe(false);
  });
});
