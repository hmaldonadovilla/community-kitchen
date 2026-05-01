import { isRetryableRecordBusyMessage } from '../../../src/web/react/app/retryableRecordBusy';

describe('retryable record busy message helpers', () => {
  it('recognizes transient record and follow-up queue failures', () => {
    expect(isRetryableRecordBusyMessage('Could not acquire the record save lock. Please retry.')).toBe(true);
    expect(isRetryableRecordBusyMessage('Another record mutation is still running.')).toBe(true);
    expect(isRetryableRecordBusyMessage('Could not queue follow-up actions. Please retry.')).toBe(true);
    expect(isRetryableRecordBusyMessage('Record is stale. Please refresh.')).toBe(false);
    expect(isRetryableRecordBusyMessage('Validation failed.')).toBe(false);
  });
});
