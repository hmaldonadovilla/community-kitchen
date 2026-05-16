import '../../mocks/GoogleAppsScript';
import { MockSpreadsheet } from '../../mocks/GoogleAppsScript';
import { UploadService } from '../../../src/services/webform/uploads';

const makeResponse = (code: number, body: any = {}): GoogleAppsScript.URL_Fetch.HTTPResponse =>
  ({
    getResponseCode: () => code,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body))
  } as any);

const makeUpload = (name: string, value: string) => ({
  name,
  type: 'image/jpeg',
  dataUrl: `data:image/jpeg;base64,${Buffer.from(value).toString('base64')}`
});

describe('UploadService', () => {
  const originalScriptApp = (global as any).ScriptApp;
  const originalUrlFetchApp = (global as any).UrlFetchApp;
  const originalDrive = (global as any).Drive;
  const originalGetFolderById = (global as any).DriveApp.getFolderById;

  afterEach(() => {
    (global as any).ScriptApp = originalScriptApp;
    (global as any).UrlFetchApp = originalUrlFetchApp;
    (global as any).Drive = originalDrive;
    (global as any).DriveApp.getFolderById = originalGetFolderById;
    jest.restoreAllMocks();
  });

  test('uploads multiple blobs through capped Drive REST fetchAll while preserving URL order', () => {
    const createFile = jest.fn(() => ({ getUrl: () => 'https://drive.test/sequential' }));
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile
    }));
    (global as any).ScriptApp = { getOAuthToken: jest.fn(() => 'token-1') };
    (global as any).UrlFetchApp = {
      fetchAll: jest.fn((requests: any[]) =>
        requests.map((_, index) =>
          makeResponse(200, {
            id: `drive-file-${index + 1}`,
            alternateLink: `https://drive.google.com/file/d/drive-file-${index + 1}/view`
          })
        )
      )
    };

    const service = new UploadService(new MockSpreadsheet() as any);
    const urls = service.saveFiles(
      [makeUpload('first.jpg', 'first'), makeUpload('second.jpg', 'second'), makeUpload('third.jpg', 'third')],
      { destinationFolderId: 'folder-1', serverUploadConcurrency: 3 } as any
    );

    expect(urls).toBe(
      [
        'https://drive.google.com/file/d/drive-file-1/view',
        'https://drive.google.com/file/d/drive-file-2/view',
        'https://drive.google.com/file/d/drive-file-3/view'
      ].join(', ')
    );
    expect((global as any).UrlFetchApp.fetchAll).toHaveBeenCalledTimes(1);
    expect((global as any).UrlFetchApp.fetchAll.mock.calls[0][0]).toHaveLength(3);
    expect((global as any).UrlFetchApp.fetchAll.mock.calls[0][0][0]).toMatchObject({
      url: expect.stringContaining('/upload/drive/v2/files?'),
      method: 'post',
      headers: { Authorization: 'Bearer token-1' },
      muteHttpExceptions: true
    });
    expect(createFile).not.toHaveBeenCalled();
  });

  test('chunks Drive REST uploads by serverUploadConcurrency', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).ScriptApp = { getOAuthToken: jest.fn(() => 'token-1') };
    let counter = 0;
    (global as any).UrlFetchApp = {
      fetchAll: jest.fn((requests: any[]) =>
        requests.map(() => {
          counter += 1;
          return makeResponse(200, {
            id: `drive-file-${counter}`,
            alternateLink: `https://drive.google.com/file/d/drive-file-${counter}/view`
          });
        })
      )
    };

    const service = new UploadService(new MockSpreadsheet() as any);
    const urls = service.saveFiles(
      [makeUpload('first.jpg', 'first'), makeUpload('second.jpg', 'second'), makeUpload('third.jpg', 'third')],
      { destinationFolderId: 'folder-1', serverUploadConcurrency: 2 } as any
    );

    expect(urls).toBe(
      [
        'https://drive.google.com/file/d/drive-file-1/view',
        'https://drive.google.com/file/d/drive-file-2/view',
        'https://drive.google.com/file/d/drive-file-3/view'
      ].join(', ')
    );
    expect((global as any).UrlFetchApp.fetchAll).toHaveBeenCalledTimes(2);
    expect((global as any).UrlFetchApp.fetchAll.mock.calls[0][0]).toHaveLength(2);
    expect((global as any).UrlFetchApp.fetchAll.mock.calls[1][0]).toHaveLength(1);
  });

  test('trashes files created by a failed parallel upload batch', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).ScriptApp = { getOAuthToken: jest.fn(() => 'token-1') };
    (global as any).Drive = { Files: { update: jest.fn() } };
    (global as any).UrlFetchApp = {
      fetchAll: jest.fn(() => [
        makeResponse(200, {
          id: 'created-before-failure',
          alternateLink: 'https://drive.google.com/file/d/created-before-failure/view'
        }),
        makeResponse(500, { error: { message: 'Drive transient failure' } })
      ])
    };

    const service = new UploadService(new MockSpreadsheet() as any);

    expect(() =>
      service.saveFiles(
        [makeUpload('first.jpg', 'first'), makeUpload('second.jpg', 'second')],
        { destinationFolderId: 'folder-1', serverUploadConcurrency: 2 } as any
      )
    ).toThrow(/Drive transient failure/);
    expect((global as any).Drive.Files.update).toHaveBeenCalledWith(
      { trashed: true },
      'created-before-failure',
      undefined,
      { supportsAllDrives: true }
    );
  });

  test('falls back to sequential DriveApp uploads when fetchAll is unavailable', () => {
    const createFile = jest
      .fn()
      .mockReturnValueOnce({ getUrl: () => 'https://drive.test/first' })
      .mockReturnValueOnce({ getUrl: () => 'https://drive.test/second' });
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile
    }));
    (global as any).ScriptApp = undefined;
    (global as any).UrlFetchApp = undefined;

    const service = new UploadService(new MockSpreadsheet() as any);
    const urls = service.saveFiles(
      [makeUpload('first.jpg', 'first'), makeUpload('second.jpg', 'second')],
      { destinationFolderId: 'folder-1', serverUploadConcurrency: 3 } as any
    );

    expect(urls).toBe('https://drive.test/first, https://drive.test/second');
    expect(createFile).toHaveBeenCalledTimes(2);
  });
});
