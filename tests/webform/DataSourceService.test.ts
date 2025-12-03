import '../mocks/GoogleAppsScript';
import { DataSourceService } from '../../src/services/webform/dataSources';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';

describe('DataSourceService', () => {
  test('paginates and filters by locale key', () => {
    const ss = new MockSpreadsheet() as any;
    const sheet = ss.insertSheet('Source');
    sheet.setMockData([
      ['Name', 'Locale', 'Value'],
      ['Alpha', 'EN', '1'],
      ['Beta', 'FR', '2'],
      ['Gamma', 'EN', '3']
    ]);

    const service = new DataSourceService(ss);
    const first = service.fetchDataSource({ id: 'Source', projection: ['Name', 'Value'], localeKey: 'Locale' }, 'EN', undefined, 2);
    expect(first.items.length).toBe(1);
    expect((first.items[0] as any).Name).toBe('Alpha');
    expect(first.nextPageToken).toBeDefined();

    const second = service.fetchDataSource({ id: 'Source', projection: ['Name', 'Value'], localeKey: 'Locale' }, 'EN', undefined, 2, first.nextPageToken);
    expect(second.items.length).toBe(1);
    expect((second.items[0] as any).Name).toBe('Gamma');
    expect(second.nextPageToken).toBeUndefined();
  });
});
