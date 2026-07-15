import { SubmissionService } from '../../../src/services/webform/submissions';
import { withSharedDocumentLock } from '../../../src/services/webform/documentLock';

const LINK_1 = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view';
const LINK_2 = 'https://drive.google.com/file/d/2AbCdEfGhIjKlMnOpQrStUvWxYz/view';
const LINK_2_OPEN = 'https://drive.google.com/open?id=2AbCdEfGhIjKlMnOpQrStUvWxYz';

const scannerQuestions = (maxFiles = 10): any[] => [
  {
    id: 'RECEIPTS',
    type: 'FILE_UPLOAD',
    status: 'Active',
    uploadConfig: { maxFiles }
  },
  { id: 'OTHER', type: 'TEXT', status: 'Active' }
];

const makeSubmissionHarness = () => {
  const row: any[] = [
    'REC-1',
    7,
    new Date('2026-07-15T09:00:00.000Z'),
    new Date('2026-07-15T09:30:00.000Z'),
    LINK_1,
    'preserve me'
  ];
  const writes: Array<{ row: number; column: number; values: any[][] }> = [];
  const range = (rowNumber: number, column: number, _rows = 1, columns = 1) => ({
    getValues: () => [row.slice(column - 1, column - 1 + columns)],
    setValues: (values: any[][]) => {
      writes.push({ row: rowNumber, column, values });
      values[0].forEach((value, index) => {
        row[column - 1 + index] = value;
      });
      return range(rowNumber, column, 1, columns);
    },
    createTextFinder: () => ({
      matchEntireCell: () => ({ findNext: () => ({ getRow: () => 2 }) })
    })
  });
  const sheet = {
    getLastRow: () => 2,
    getRange: range,
    getName: () => 'Receipts Responses'
  } as any;
  const spreadsheet = {
    getSheetByName: jest.fn((name: string) => (name === 'Receipts Responses' ? sheet : null))
  } as any;
  const cache = {
    bumpSheetEtag: jest.fn(() => 'etag-2'),
    cacheRecord: jest.fn()
  } as any;
  const service = new SubmissionService(spreadsheet, {} as any, cache, null);
  (service as any).ensureDestination = jest.fn(() => ({
    sheet,
    headers: ['Record ID', 'Data Version', 'Created At', 'Updated At', 'Receipts [RECEIPTS]', 'Other [OTHER]'],
    columns: {
      recordId: 1,
      dataVersion: 2,
      createdAt: 3,
      updatedAt: 4,
      fields: { RECEIPTS: 5, OTHER: 6 }
    }
  }));
  (service as any).writeAuditRows = jest.fn();
  return { cache, row, service, writes };
};

describe('field-scoped QR scanner persistence', () => {
  beforeEach(() => {
    (globalThis as any).SpreadsheetApp = { flush: jest.fn() };
    const scriptLock = { tryLock: jest.fn(() => true), releaseLock: jest.fn() };
    (globalThis as any).LockService = {
      getDocumentLock: jest.fn(() => null),
      getScriptLock: jest.fn(() => scriptLock)
    };
  });

  afterEach(() => {
    delete (globalThis as any).SpreadsheetApp;
    delete (globalThis as any).LockService;
  });

  test('appends only the target upload cell and server-owned metadata', () => {
    const { cache, row, service, writes } = makeSubmissionHarness();
    const result = service.appendQrScannerUploadLinks({
      form: { title: 'Receipts', configSheet: 'Config: Receipts', destinationTab: 'Receipts Responses' } as any,
      questions: scannerQuestions(),
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_2],
      expectedDataVersion: 7
    });

    expect(result).toMatchObject({
      success: true,
      appendedCount: 1,
      dataVersion: 8,
      fieldValue: `${LINK_1}, ${LINK_2}`,
      links: [LINK_1, LINK_2],
      idempotent: false
    });
    expect(row[4]).toBe(`${LINK_1}, ${LINK_2}`);
    expect(row[5]).toBe('preserve me');
    expect(row[1]).toBe(8);
    expect(writes).toHaveLength(1);
    expect(writes[0].column + writes[0].values[0].length - 1).toBe(5);
    expect((globalThis as any).SpreadsheetApp.flush).toHaveBeenCalledTimes(1);
    expect(cache.bumpSheetEtag).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'qrScanner.appendUploadLinks');
  });

  test('reconciles an already-linked retry before rejecting its now-stale version', () => {
    const { row, service, writes } = makeSubmissionHarness();
    row[1] = 8;
    row[4] = `${LINK_1}, ${LINK_2_OPEN}`;
    const result = service.appendQrScannerUploadLinks({
      form: { title: 'Receipts', configSheet: 'Config: Receipts', destinationTab: 'Receipts Responses' } as any,
      questions: scannerQuestions(),
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_2],
      expectedDataVersion: 7
    });
    expect(result).toMatchObject({
      success: true,
      appendedCount: 0,
      dataVersion: 8,
      fieldValue: `${LINK_1}, ${LINK_2_OPEN}`,
      links: [LINK_1, LINK_2_OPEN],
      idempotent: true
    });
    expect(writes).toHaveLength(0);
  });

  test('rejects a real version conflict without writing any cell', () => {
    const { row, service, writes } = makeSubmissionHarness();
    row[1] = 8;
    const result = service.appendQrScannerUploadLinks({
      form: { title: 'Receipts', configSheet: 'Config: Receipts', destinationTab: 'Receipts Responses' } as any,
      questions: scannerQuestions(),
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_2],
      expectedDataVersion: 7
    });
    expect(result).toMatchObject({ success: false, code: 'RECORD_CHANGED', dataVersion: 8 });
    expect(writes).toHaveLength(0);
  });

  test('rechecks the authoritative maximum inside the locked field commit', () => {
    const { row, service, writes } = makeSubmissionHarness();
    const result = service.appendQrScannerUploadLinks({
      form: { title: 'Receipts', configSheet: 'Config: Receipts', destinationTab: 'Receipts Responses' } as any,
      questions: scannerQuestions(1),
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_2],
      expectedDataVersion: 7
    });

    expect(result).toMatchObject({
      success: false,
      code: 'LIMIT_REACHED',
      dataVersion: 7,
      fieldValue: LINK_1,
      links: [LINK_1]
    });
    expect(row[4]).toBe(LINK_1);
    expect(writes).toHaveLength(0);
  });

  test('rejects unsupported internal commit links without a partial write', () => {
    const { service, writes } = makeSubmissionHarness();
    const result = service.appendQrScannerUploadLinks({
      form: { title: 'Receipts', configSheet: 'Config: Receipts', destinationTab: 'Receipts Responses' } as any,
      questions: scannerQuestions(),
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_2, 'https://example.test/not-a-drive-file'],
      expectedDataVersion: 7
    });

    expect(result).toMatchObject({ success: false, code: 'CONFIGURATION_ERROR' });
    expect(writes).toHaveLength(0);
  });

  test('keeps post-write flush and cache maintenance outside the durable commit result', () => {
    const { cache, row, service, writes } = makeSubmissionHarness();
    (globalThis as any).SpreadsheetApp.flush.mockImplementation(() => {
      throw new Error('flush unavailable');
    });
    cache.bumpSheetEtag.mockImplementation(() => {
      throw new Error('cache unavailable');
    });

    const result = service.appendQrScannerUploadLinks({
      form: { title: 'Receipts', configSheet: 'Config: Receipts', destinationTab: 'Receipts Responses' } as any,
      questions: scannerQuestions(),
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_2],
      expectedDataVersion: 7
    });

    expect(result).toMatchObject({
      success: true,
      appendedCount: 1,
      dataVersion: 8,
      fieldValue: `${LINK_1}, ${LINK_2}`
    });
    expect(row[4]).toBe(`${LINK_1}, ${LINK_2}`);
    expect(writes).toHaveLength(1);
  });

  test('falls back to ScriptLock when a web-app invocation has no document lock', () => {
    const scriptLock = { tryLock: jest.fn(() => true), releaseLock: jest.fn() };
    (globalThis as any).LockService = {
      getDocumentLock: jest.fn(() => null),
      getScriptLock: jest.fn(() => scriptLock)
    };
    expect(withSharedDocumentLock('test', 100, () => 'done')).toBe('done');
    expect(scriptLock.tryLock).toHaveBeenCalledWith(100);
    expect(scriptLock.releaseLock).toHaveBeenCalledTimes(1);
  });

  test('fails closed when no runtime lock is available', () => {
    delete (globalThis as any).LockService;
    const operation = jest.fn(() => 'unsafe');

    expect(() => withSharedDocumentLock('test', 100, operation)).toThrow(
      'Could not acquire the record save lock. Please retry.'
    );
    expect(operation).not.toHaveBeenCalled();
  });

  test('fails closed with the stable busy error when lock acquisition throws', () => {
    const operation = jest.fn(() => 'unsafe');
    const lock = {
      tryLock: () => {
        throw new Error('runtime lock failure');
      },
      releaseLock: jest.fn()
    };

    expect(() =>
      withSharedDocumentLock('test', 100, operation, undefined, { lock })
    ).toThrow('Could not acquire the record save lock. Please retry.');
    expect(operation).not.toHaveBeenCalled();
  });

  test('allows lockless execution only through explicit test injection', () => {
    delete (globalThis as any).LockService;
    expect(
      withSharedDocumentLock('test', 100, () => 'done', undefined, { lock: null })
    ).toBe('done');
  });

  test('does not turn a completed operation into a failure when lock release throws', () => {
    const lock = {
      tryLock: jest.fn(() => true),
      releaseLock: jest.fn(() => {
        throw new Error('release failed');
      })
    };
    expect(
      withSharedDocumentLock('test', 100, () => 'done', undefined, { lock })
    ).toBe('done');
  });
});
