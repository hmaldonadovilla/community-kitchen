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
});


