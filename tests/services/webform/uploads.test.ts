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
  const stagingIngredientReceiptFolderId = '1f_OZ4O7mEjdZ7jdVtYRe8WdpsXqLWufu';
  const qrExampleFileId = '1nhhILSgLLXn2TKoljGZ9XyGGVstyENlu';
  const qrWrongFolderFileId = '1g52g7XOLZHIVkBWPPYKgAPZUGwbU0vIQ';
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

  test('accepts captured Drive links from the configured customer Shared Drive', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).Drive = {
      Files: {
        get: jest.fn((fileId: string) => {
          if (fileId === 'folder-1') return { id: 'folder-1', driveId: 'customer-drive-1', parents: [] };
          if (fileId === 'receipt-file-1') {
            return {
              id: 'receipt-file-1',
              driveId: 'customer-drive-1',
              parents: [{ id: 'invoices-folder' }],
              labels: { trashed: false },
              alternateLink: 'https://drive.google.com/file/d/receipt-file-1/view'
            };
          }
          throw new Error(`Unexpected file id ${fileId}`);
        })
      }
    };

    const service = new UploadService(new MockSpreadsheet() as any);
    const urls = service.saveFiles([`https://drive.google.com/file/d/receipt-file-1/view`], {
      destinationFolderId: 'folder-1',
      linkCapture: {
        enabled: true,
        mode: 'driveQr',
        validation: {
          requireServerValidation: true,
          includeUploadDestinationDrive: true,
          rejectTrashed: true
        }
      }
    } as any);

    expect(urls).toBe('https://drive.google.com/file/d/receipt-file-1/view');
    expect((global as any).Drive.Files.get).toHaveBeenCalledWith('folder-1', { supportsAllDrives: true });
    expect((global as any).Drive.Files.get).toHaveBeenCalledWith('receipt-file-1', { supportsAllDrives: true });
  });

  test('accepts captured Drive links from the configured destination folder without a Shared Drive id', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).Drive = {
      Files: {
        get: jest.fn((fileId: string) => {
          if (fileId === 'folder-1') return { id: 'folder-1', parents: [] };
          if (fileId === 'receipt-file-1') {
            return {
              id: 'receipt-file-1',
              parents: [{ id: 'folder-1' }],
              labels: { trashed: false },
              alternateLink: 'https://drive.google.com/file/d/receipt-file-1/view'
            };
          }
          throw new Error(`Unexpected file id ${fileId}`);
        })
      }
    };

    const service = new UploadService(new MockSpreadsheet() as any);
    const urls = service.saveFiles([`https://drive.google.com/open?id=receipt-file-1`], {
      destinationFolderId: 'folder-1',
      linkCapture: {
        enabled: true,
        mode: 'driveQr',
        validation: {
          requireServerValidation: true,
          includeUploadDestinationFolder: true,
          includeUploadDestinationDrive: true,
          rejectTrashed: true
        }
      }
    } as any);

    expect(urls).toBe('https://drive.google.com/file/d/receipt-file-1/view');
  });

  test('accepts encoded redirect QR values that resolve to Drive file links', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).Drive = {
      Files: {
        get: jest.fn((fileId: string) => {
          if (fileId === 'folder-1') return { id: 'folder-1', parents: [] };
          if (fileId === 'receipt-file-1') {
            return {
              id: 'receipt-file-1',
              parents: [{ id: 'folder-1' }],
              labels: { trashed: false },
              alternateLink: 'https://drive.google.com/file/d/receipt-file-1/view'
            };
          }
          throw new Error(`Unexpected file id ${fileId}`);
        })
      }
    };

    const service = new UploadService(new MockSpreadsheet() as any);
    const qrValue = `https://www.google.com/url?q=${encodeURIComponent('https://drive.google.com/file/d/receipt-file-1/view')}`;
    const urls = service.saveFiles([qrValue], {
      destinationFolderId: 'folder-1',
      linkCapture: {
        enabled: true,
        mode: 'driveQr',
        validation: {
          requireServerValidation: true,
          includeUploadDestinationFolder: true,
          rejectTrashed: true
        }
      }
    } as any);

    expect(urls).toBe('https://drive.google.com/file/d/receipt-file-1/view');
  });

  test('accepts the checked-in QR example when the Drive file is in the destination folder', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => stagingIngredientReceiptFolderId,
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).Drive = {
      Files: {
        get: jest.fn((fileId: string) => {
          if (fileId === stagingIngredientReceiptFolderId) {
            return { id: stagingIngredientReceiptFolderId, parents: [] };
          }
          if (fileId === qrExampleFileId) {
            return {
              id: qrExampleFileId,
              parents: [{ id: stagingIngredientReceiptFolderId }],
              labels: { trashed: false },
              alternateLink: `https://drive.google.com/file/d/${qrExampleFileId}/view`
            };
          }
          throw new Error(`Unexpected file id ${fileId}`);
        })
      }
    };

    const service = new UploadService(new MockSpreadsheet() as any);
    const urls = service.saveFiles([`https://drive.google.com/file/d/${qrExampleFileId}/view`], {
      destinationFolderId: stagingIngredientReceiptFolderId,
      linkCapture: {
        enabled: true,
        mode: 'driveQr',
        validation: {
          requireServerValidation: true,
          includeUploadDestinationFolder: true,
          includeUploadDestinationDrive: true,
          rejectTrashed: true
        }
      }
    } as any);

    expect(urls).toBe(`https://drive.google.com/file/d/${qrExampleFileId}/view`);
  });

  test('rejects the checked-in wrong-folder QR example when the Drive file is outside the destination folder', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => stagingIngredientReceiptFolderId,
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).Drive = {
      Files: {
        get: jest.fn((fileId: string) => {
          if (fileId === stagingIngredientReceiptFolderId) {
            return { id: stagingIngredientReceiptFolderId, parents: [] };
          }
          if (fileId === qrWrongFolderFileId) {
            return {
              id: qrWrongFolderFileId,
              parents: [{ id: 'other-folder' }],
              labels: { trashed: false },
              alternateLink: `https://drive.google.com/file/d/${qrWrongFolderFileId}/view`
            };
          }
          if (fileId === 'other-folder') {
            return { id: 'other-folder', parents: [] };
          }
          throw new Error(`Unexpected file id ${fileId}`);
        })
      }
    };

    const service = new UploadService(new MockSpreadsheet() as any);
    expect(() =>
      service.saveFiles([`https://drive.google.com/file/d/${qrWrongFolderFileId}/view`], {
        destinationFolderId: stagingIngredientReceiptFolderId,
        linkCapture: {
          enabled: true,
          mode: 'driveQr',
          validation: {
            requireServerValidation: true,
            includeUploadDestinationFolder: true,
            includeUploadDestinationDrive: true,
            rejectTrashed: true
          }
        }
      } as any)
    ).toThrow(/CK_UPLOAD_LINK_VALIDATION:outOfScope/);
  });

  test('rejects captured Drive links outside the configured customer Shared Drive', () => {
    (global as any).DriveApp.getFolderById = jest.fn(() => ({
      getId: () => 'folder-1',
      getName: () => 'Uploads',
      createFile: jest.fn()
    }));
    (global as any).Drive = {
      Files: {
        get: jest.fn((fileId: string) => {
          if (fileId === 'folder-1') return { id: 'folder-1', driveId: 'customer-drive-1', parents: [] };
          if (fileId === 'receipt-file-1') {
            return {
              id: 'receipt-file-1',
              driveId: 'other-drive',
              parents: [{ id: 'external-folder' }],
              labels: { trashed: false }
            };
          }
          throw new Error(`Unexpected file id ${fileId}`);
        })
      }
    };

    const service = new UploadService(new MockSpreadsheet() as any);

    expect(() =>
      service.saveFiles([`https://drive.google.com/file/d/receipt-file-1/view`], {
        destinationFolderId: 'folder-1',
        linkCapture: {
          enabled: true,
          mode: 'driveQr',
          validation: {
            requireServerValidation: true,
            includeUploadDestinationDrive: true,
            rejectTrashed: true
          }
        }
      } as any)
    ).toThrow(/configured customer Drive/);
  });
});
