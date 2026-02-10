import '../mocks/GoogleAppsScript';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';
import { CacheEtagManager } from '../../src/services/webform/cache';
import { ListingService } from '../../src/services/webform/listing';
import { SubmissionService } from '../../src/services/webform/submissions';
import { UploadService } from '../../src/services/webform/uploads';

describe('ListingService', () => {
  test('fetchSubmissionsBatch respects includePageRecords flag', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Responses');
    sheet.setMockData([
      ['Language', 'Dish', 'Record ID', 'Created At', 'Updated At', 'Status', 'PDF URL'],
      ['EN', 'Soup', 'id-1', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-02T00:00:00Z'), 'Open', ''],
      ['EN', 'Salad', 'id-2', new Date('2025-01-03T00:00:00Z'), new Date('2025-01-04T00:00:00Z'), 'Closed', 'http://pdf']
    ]);

    const cacheManager = new CacheEtagManager(null, null);
    const uploads = new UploadService(ss);
    const submissions = new SubmissionService(ss, uploads, cacheManager, null);
    const listing = new ListingService(submissions, cacheManager);

    const form: any = { title: 'Test', configSheet: 'Config: Test', destinationTab: 'Responses' };
    const questions: any[] = [{ id: 'DISH', qEn: 'Dish', qFr: 'Dish', qNl: 'Dish', type: 'TEXT', status: 'Active', required: false }];

    const projection = ['DISH'];

    const listOnly = listing.fetchSubmissionsBatch(form, questions, projection, 10, undefined, false);
    expect(Array.isArray(listOnly.list.items)).toBe(true);
    expect(listOnly.list.items.length).toBeGreaterThan(0);
    expect(Object.keys(listOnly.records).length).toBe(0);

    const withRecords = listing.fetchSubmissionsBatch(form, questions, projection, 10, undefined, true);
    expect(Object.keys(withRecords.records)).toEqual(expect.arrayContaining(['id-1', 'id-2']));
    expect((withRecords.records['id-1'] as any).values.DISH).toBe('Soup');
    expect((withRecords.records['id-2'] as any).values.DISH).toBe('Salad');
  });

  test('fetchSubmissionsSortedBatch sorts by listViewSort priorities as tie-breakers', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Responses');
    sheet.setMockData([
      ['Language', 'DATE', 'CHECK_FREQ', 'Record ID', 'Created At', 'Updated At', 'Status', 'PDF URL'],
      ['EN', new Date('2025-01-02T00:00:00Z'), 'PM', 'id-1', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-02T00:00:00Z'), 'Open', ''],
      ['EN', new Date('2025-01-02T00:00:00Z'), 'AM', 'id-2', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-02T00:00:00Z'), 'Open', ''],
      ['EN', new Date('2025-01-01T00:00:00Z'), 'AM', 'id-3', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'), 'Open', '']
    ]);

    const cacheManager = new CacheEtagManager(null, null);
    const uploads = new UploadService(ss);
    const submissions = new SubmissionService(ss, uploads, cacheManager, null);
    const listing = new ListingService(submissions, cacheManager);

    const form: any = { title: 'Test', configSheet: 'Config: Test', destinationTab: 'Responses' };
    const questions: any[] = [
      {
        id: 'DATE',
        qEn: 'Date',
        qFr: 'Date',
        qNl: 'Date',
        type: 'DATE',
        status: 'Active',
        required: false,
        listView: true,
        listViewSort: { direction: 'desc', priority: 1 }
      },
      {
        id: 'CHECK_FREQ',
        qEn: 'Check frequency',
        qFr: 'Check frequency',
        qNl: 'Check frequency',
        type: 'CHOICE',
        status: 'Active',
        required: false,
        listView: true,
        listViewSort: { direction: 'asc', priority: 2 }
      }
    ];

    // Primary sort is DATE desc (caller-provided). CHECK_FREQ asc should be used as a tie-breaker because
    // it is configured via question.listViewSort priority 2.
    const res = listing.fetchSubmissionsSortedBatch(form, questions, ['DATE', 'CHECK_FREQ'], 10, undefined, false, undefined, {
      fieldId: 'DATE',
      direction: 'desc'
    });

    const ids = (res.list.items || []).map((r: any) => r.id);
    // DATE desc puts id-1/id-2 (2025-01-02) before id-3 (2025-01-01),
    // and CHECK_FREQ asc makes AM before PM within the same date.
    expect(ids).toEqual(['id-2', 'id-1', 'id-3']);
  });

  test('fetchSubmissionsSortedBatch uses updatedAt/id as stable tie-breakers (system fields) when sort keys collide', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Responses');
    sheet.setMockData([
      ['Language', 'DATE', 'CHECK_FREQ', 'Record ID', 'Created At', 'Updated At', 'Status', 'PDF URL'],
      // Same DATE and CHECK_FREQ => should be ordered by Updated At desc, then id asc.
      ['EN', new Date('2025-01-02T00:00:00Z'), 'AM', 'id-1', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-02T00:00:00Z'), 'Open', ''],
      ['EN', new Date('2025-01-02T00:00:00Z'), 'AM', 'id-2', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-03T00:00:00Z'), 'Open', '']
    ]);

    const cacheManager = new CacheEtagManager(null, null);
    const uploads = new UploadService(ss);
    const submissions = new SubmissionService(ss, uploads, cacheManager, null);
    const listing = new ListingService(submissions, cacheManager);

    const form: any = { title: 'Test', configSheet: 'Config: Test', destinationTab: 'Responses' };
    const questions: any[] = [
      {
        id: 'DATE',
        qEn: 'Date',
        qFr: 'Date',
        qNl: 'Date',
        type: 'DATE',
        status: 'Active',
        required: false,
        listView: true,
        listViewSort: { direction: 'desc', priority: 1 }
      },
      {
        id: 'CHECK_FREQ',
        qEn: 'Check frequency',
        qFr: 'Check frequency',
        qNl: 'Check frequency',
        type: 'CHOICE',
        status: 'Active',
        required: false,
        listView: true,
        listViewSort: { direction: 'asc', priority: 2 }
      }
    ];

    const res = listing.fetchSubmissionsSortedBatch(form, questions, ['DATE', 'CHECK_FREQ'], 10, undefined, false, undefined, {
      fieldId: 'DATE',
      direction: 'desc'
    });
    const ids = (res.list.items || []).map((r: any) => r.id);
    // Both rows tie on DATE and CHECK_FREQ, so Updated At desc puts id-2 (2025-01-03) before id-1 (2025-01-02).
    expect(ids).toEqual(['id-2', 'id-1']);
  });

  test('fetchSubmissionsSortedBatch returns notModified when client etag matches', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Responses');
    sheet.setMockData([
      ['Language', 'DATE', 'Record ID', 'Created At', 'Updated At', 'Status', 'PDF URL'],
      ['EN', new Date('2025-01-02T00:00:00Z'), 'id-1', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-02T00:00:00Z'), 'Open', ''],
      ['EN', new Date('2025-01-03T00:00:00Z'), 'id-2', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-03T00:00:00Z'), 'Open', '']
    ]);

    const cacheManager = new CacheEtagManager(null, null);
    const uploads = new UploadService(ss);
    const submissions = new SubmissionService(ss, uploads, cacheManager, null);
    const listing = new ListingService(submissions, cacheManager);

    const form: any = { title: 'Test', configSheet: 'Config: Test', destinationTab: 'Responses' };
    const questions: any[] = [
      {
        id: 'DATE',
        qEn: 'Date',
        qFr: 'Date',
        qNl: 'Date',
        type: 'DATE',
        status: 'Active',
        required: false,
        listView: true
      }
    ];

    const first = listing.fetchSubmissionsSortedBatch(form, questions, ['DATE'], 10, undefined, false, undefined, {
      fieldId: 'DATE',
      direction: 'desc'
    });
    const etag = (first.list as any).etag;
    expect(typeof etag).toBe('string');
    expect((etag || '').toString().length).toBeGreaterThan(0);

    const second = listing.fetchSubmissionsSortedBatch(form, questions, ['DATE'], 10, undefined, false, undefined, {
      fieldId: 'DATE',
      direction: 'desc',
      __ifNoneMatch: true,
      __clientEtag: etag
    } as any);

    expect((second.list as any).notModified).toBe(true);
    expect(second.list.items).toEqual([]);
    expect(second.list.totalCount).toBe(2);
    expect((second.list as any).etag).toBe(etag);
  });
});

