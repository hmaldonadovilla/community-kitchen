import { AppsScriptQrScannerDriveRepository } from '../../../src/services/webform/qrScannerAppsScript/driveRepository';

const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
const FOLDER_ID = '9AbCdEfGhIjKlMnOpQrStUvWxYz';
const ROOT_FOLDER_ID = '8AbCdEfGhIjKlMnOpQrStUvWxYz';

describe('Apps Script QR scanner Drive repository', () => {
  const originalDrive = (globalThis as any).Drive;
  const originalCacheService = (globalThis as any).CacheService;

  afterEach(() => {
    if (originalDrive === undefined) delete (globalThis as any).Drive;
    else (globalThis as any).Drive = originalDrive;
    if (originalCacheService === undefined) delete (globalThis as any).CacheService;
    else (globalThis as any).CacheService = originalCacheService;
  });

  test('requests only the Drive v2 fields required for authorization', () => {
    const get = jest.fn(() => ({
      id: FILE_ID,
      title: 'Receipt.jpg',
      mimeType: 'image/jpeg',
      labels: { trashed: false },
      parents: [{ id: FOLDER_ID }]
    }));
    (globalThis as any).Drive = { Files: { get } };
    delete (globalThis as any).CacheService;

    const metadata = new AppsScriptQrScannerDriveRepository().fetchMetadata(FILE_ID);

    expect(metadata).toMatchObject({
      id: FILE_ID,
      name: 'Receipt.jpg',
      mimeType: 'image/jpeg',
      trashed: false,
      parentIds: [FOLDER_ID]
    });
    expect(get).toHaveBeenCalledWith(FILE_ID, {
      supportsAllDrives: true,
      fields: 'id,title,mimeType,labels/trashed,parents/id,teamDriveId,shortcutDetails'
    });
  });

  test('shares only short-lived folder metadata between repository instances', () => {
    const cacheValues: Record<string, string> = {};
    const cache = {
      get: jest.fn((key: string) => cacheValues[key] || null),
      put: jest.fn((key: string, value: string) => {
        cacheValues[key] = value;
      })
    };
    const get = jest.fn((id: string) => ({
      id,
      title: id === FOLDER_ID ? 'Receipts' : 'Receipt.jpg',
      mimeType: id === FOLDER_ID ? 'application/vnd.google-apps.folder' : 'image/jpeg',
      labels: { trashed: false },
      parents: id === FOLDER_ID ? [{ id: ROOT_FOLDER_ID }] : []
    }));
    (globalThis as any).Drive = { Files: { get } };
    (globalThis as any).CacheService = { getScriptCache: () => cache };

    const firstRepository = new AppsScriptQrScannerDriveRepository();
    const secondRepository = new AppsScriptQrScannerDriveRepository();
    expect(firstRepository.fetchMetadata(FOLDER_ID, 'folder').id).toBe(FOLDER_ID);
    expect(secondRepository.fetchMetadata(FOLDER_ID, 'folder')).toMatchObject({
      id: FOLDER_ID,
      parentIds: [ROOT_FOLDER_ID]
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledWith(
      `ck.qr.folder.v1:${FOLDER_ID}`,
      expect.any(String),
      60
    );

    firstRepository.fetchMetadata(FILE_ID);
    secondRepository.fetchMetadata(FILE_ID);
    expect(get.mock.calls.filter(([id]) => id === FILE_ID)).toHaveLength(2);
    expect(cache.put.mock.calls.some(([key]) => key.includes(FILE_ID))).toBe(false);
  });
});
