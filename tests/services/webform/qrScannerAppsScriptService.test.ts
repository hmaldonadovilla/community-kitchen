import { QrScannerFileAuthorizationService } from '../../../src/services/webform/qrScannerAppsScript/authorization';
import { AppsScriptQrScannerService } from '../../../src/services/webform/qrScannerAppsScript/service';
import { AppsScriptQrScannerSessionStore } from '../../../src/services/webform/qrScannerAppsScript/sessionStore';
import {
  DriveAuthorizationMetadata,
  QrScannerAuthoritativeService,
  QrScannerCrypto,
  QrScannerDriveRepository,
  QrScannerRuntime
} from '../../../src/services/webform/qrScannerAppsScript/types';

const NOW = new Date('2026-07-15T10:00:00.000Z');
const FILE_1 = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
const FILE_2 = '2AbCdEfGhIjKlMnOpQrStUvWxYz';
const FOLDER = '9AbCdEfGhIjKlMnOpQrStUvWxYz';
const LINK_1 = `https://drive.google.com/file/d/${FILE_1}/view`;
const LINK_2 = `https://drive.google.com/file/d/${FILE_2}/view`;

class FakeCrypto implements QrScannerCrypto {
  private sequence = 0;
  private readonly hashes = new Map<string, string>();

  hash(value: string): string {
    if (!this.hashes.has(value)) this.hashes.set(value, `digest-${this.hashes.size + 1}`);
    return this.hashes.get(value)!;
  }

  deriveAccessToken(launchToken: string, sessionId: string, clientNonce: string): string {
    return `access-${this.hash(`${launchToken}|${sessionId}|${clientNonce}`)}`;
  }

  matches(value: string, expectedHash?: string): boolean {
    return this.hash(value) === expectedHash;
  }

  randomToken(): string {
    this.sequence += 1;
    return `opaque-${this.sequence}`;
  }
}

const config = (linkCaptureAllowedMimeTypes?: string[]): any => ({
  formKey: 'Config: Receipts',
  form: { configSheet: 'Config: Receipts' },
  questions: [
    {
      id: 'RECEIPTS',
      type: 'FILE_UPLOAD',
      status: 'Active',
      qEn: 'Ingredients receipt photos',
      uploadConfig: {
        destinationFolderId: FOLDER,
        maxFiles: 3,
        allowedMimeTypes: ['image/*'],
        allowedExtensions: ['jpg'],
        linkCapture: {
          enabled: true,
          mode: 'driveQr',
          ...(linkCaptureAllowedMimeTypes ? { allowedMimeTypes: linkCaptureAllowedMimeTypes } : {}),
          instruction: {
            en: 'Point the camera at each QR code on the ingredient receipts.'
          },
          sessionTtlMinutes: 15,
          validation: {
            requireServerValidation: true,
            includeUploadDestinationFolder: true,
            maxFolderDepth: 8
          }
        }
      }
    }
  ],
  definition: {},
  dedupRules: [],
  validationErrors: []
});

const makeAuthoritative = (linkCaptureAllowedMimeTypes?: string[]) => {
  const record: any = {
    formKey: 'Config: Receipts',
    id: 'REC-1',
    language: 'EN',
    dataVersion: 7,
    values: { RECEIPTS: '', OTHER_FIELD: 'preserve me' },
    RECEIPTS: '',
    OTHER_FIELD: 'preserve me'
  };
  const append = jest.fn((request: any) => {
    const existing = (record.values.RECEIPTS || '').split(/[\n,]+/).map((item: string) => item.trim()).filter(Boolean);
    const additions = request.links.filter((link: string) => !existing.includes(link));
    if (!additions.length) {
      return {
        success: true,
        message: 'already linked',
        appendedCount: 0,
        dataVersion: record.dataVersion,
        fieldValue: existing.join(', '),
        links: existing,
        idempotent: true
      };
    }
    if (request.expectedDataVersion !== record.dataVersion) {
      return { success: false, code: 'RECORD_CHANGED' as const, message: 'changed' };
    }
    record.values.RECEIPTS = [...existing, ...additions].join(', ');
    record.RECEIPTS = record.values.RECEIPTS;
    record.dataVersion += 1;
    return {
      success: true,
      message: 'saved',
      appendedCount: additions.length,
      dataVersion: record.dataVersion,
      fieldValue: record.values.RECEIPTS,
      links: [...existing, ...additions],
      idempotent: false
    };
  });
  const fetchFormConfig = jest.fn(() => config(linkCaptureAllowedMimeTypes));
  const fetchSubmissionById = jest.fn(() => JSON.parse(JSON.stringify(record)));
  const service: QrScannerAuthoritativeService = {
    fetchFormConfig,
    fetchSubmissionById,
    appendQrScannerUploadLinks: append
  };
  return { record, append, fetchFormConfig, fetchSubmissionById, service };
};

const makeDrive = (overrides: Partial<Record<string, Partial<DriveAuthorizationMetadata>>> = {}) => {
  const metadata: Record<string, DriveAuthorizationMetadata> = {
    [FILE_1]: {
      id: FILE_1,
      name: 'Receipt one.jpg',
      mimeType: 'image/jpeg',
      trashed: false,
      parentIds: [FOLDER],
      shortcut: false,
      ...(overrides[FILE_1] || {})
    },
    [FILE_2]: {
      id: FILE_2,
      name: 'Receipt two.jpg',
      mimeType: 'image/jpeg',
      trashed: false,
      parentIds: [FOLDER],
      shortcut: false,
      ...(overrides[FILE_2] || {})
    }
  };
  const repository: QrScannerDriveRepository = {
    fetchMetadata: jest.fn(fileId => {
      if (!metadata[fileId]) throw new Error('not found');
      return metadata[fileId];
    })
  };
  return repository;
};

const makeHarness = (drive = makeDrive(), linkCaptureAllowedMimeTypes?: string[]) => {
  const properties: Record<string, string> = {};
  const sessions = new AppsScriptQrScannerSessionStore({
    properties: {
      getProperty: key => properties[key] ?? null,
      setProperty: (key, value) => {
        properties[key] = value;
      },
      deleteProperty: key => {
        delete properties[key];
      },
      getProperties: () => ({ ...properties })
    },
    lock: null,
    nowMs: () => NOW.getTime()
  });
  const authoritative = makeAuthoritative(linkCaptureAllowedMimeTypes);
  const crypto = new FakeCrypto();
  const runtime: QrScannerRuntime = {
    now: () => new Date(NOW),
    getScriptProperty: () => null,
    getServiceUrl: () => 'https://script.google.com/macros/s/deployment/exec',
    getGeneratedAssetBaseUrl: () => 'https://stage-assets.web.app'
  };
  const service = new AppsScriptQrScannerService(
    authoritative.service,
    sessions,
    new QrScannerFileAuthorizationService(drive),
    crypto,
    runtime
  );
  return { ...authoritative, crypto, drive, properties, runtime, service, sessions };
};

const launchAndRedeem = (service: AppsScriptQrScannerService) => {
  const launch = service.createLaunch({
    formKey: 'Config: Receipts',
    recordId: 'REC-1',
    fieldId: 'RECEIPTS',
    expectedDataVersion: 7,
    returnContext: { app: 'meal-production', stepId: 'production', overlay: 'files' }
  });
  if (!launch.success) throw new Error(launch.code);
  const fragment = new URL(launch.launchUrl).hash.slice(1);
  const params = new URLSearchParams(fragment);
  const sessionId = params.get('sessionId')!;
  const launchToken = params.get('launchToken')!;
  const redeemed = service.redeem({ sessionId, launchToken, clientNonce: 'client-nonce' });
  return { launch, sessionId, launchToken, accessToken: redeemed.accessToken, session: redeemed.session };
};

describe('billing-free Apps Script QR scanner service', () => {
  test('creates a launch with one authoritative config read and one record read', () => {
    const { fetchFormConfig, fetchSubmissionById, service } = makeHarness();

    const launch = service.createLaunch({
      formKey: 'Config: Receipts',
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      expectedDataVersion: 7
    });

    expect(launch.success).toBe(true);
    expect(fetchFormConfig).toHaveBeenCalledTimes(1);
    expect(fetchSubmissionById).toHaveBeenCalledTimes(1);
  });

  test('creates and idempotently redeems an opaque launch without storing raw credentials', () => {
    const { properties, service, sessions } = makeHarness();
    const getSpy = jest.spyOn(sessions, 'get');
    const mutateSpy = jest.spyOn(sessions, 'mutate');
    const result = launchAndRedeem(service);

    expect(getSpy).not.toHaveBeenCalled();
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    expect(result.launch.launchUrl).toMatch(/^https:\/\/stage-assets\.web\.app\/qr-scanner\.html#/);
    expect(result.launch.launchUrl).not.toContain('apiBaseUrl');
    expect(result.session).toMatchObject({
      status: 'ACTIVE',
      fieldId: 'RECEIPTS',
      maxFiles: 3,
      instruction: 'Point the camera at each QR code on the ingredient receipts.'
    });
    expect(
      service.redeem({
        sessionId: result.sessionId,
        launchToken: result.launchToken,
        clientNonce: 'client-nonce'
      }).accessToken
    ).toBe(result.accessToken);
    expect(() =>
      service.redeem({
        sessionId: result.sessionId,
        launchToken: result.launchToken,
        clientNonce: 'different-client'
      })
    ).toThrow(expect.objectContaining({ code: 'INVALID_CREDENTIAL' }));

    const persisted = JSON.stringify(properties);
    expect(persisted).not.toContain(result.launchToken);
    expect(persisted).not.toContain(result.accessToken);
    expect(persisted).not.toContain('client-nonce');
  });

  test('expires an active session during the single locked redemption mutation', () => {
    const { service, sessions } = makeHarness();
    const launch = service.createLaunch({
      formKey: 'Config: Receipts',
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      expectedDataVersion: 7
    });
    if (!launch.success) throw new Error(launch.code);
    const params = new URLSearchParams(new URL(launch.launchUrl).hash.slice(1));
    const sessionId = params.get('sessionId')!;
    const launchToken = params.get('launchToken')!;
    sessions.mutate(sessionId, current => ({ ...current, expiresAt: '2026-07-15T09:59:00.000Z' }));
    const getSpy = jest.spyOn(sessions, 'get');
    const mutateSpy = jest.spyOn(sessions, 'mutate');

    expect(() => service.redeem({ sessionId, launchToken, clientNonce: 'client-nonce' })).toThrow(
      expect.objectContaining({ code: 'SESSION_EXPIRED' })
    );

    expect(getSpy).not.toHaveBeenCalled();
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(sessions.get(sessionId)?.status).toBe('EXPIRED');
  });

  test('checks multiple candidates, deduplicates and commits only the target field idempotently', () => {
    const { append, drive, properties, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };

    const invalidRaw = 'not a drive URL';
    expect(service.addCandidate({ ...auth, scanId: 'scan-invalid', rawValue: invalidRaw }).candidate).toMatchObject({
      status: 'REJECTED',
      code: 'INVALID_PAYLOAD'
    });
    expect(service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 }).candidate).toMatchObject({
      status: 'AUTHORISED',
      code: 'ACCEPTED',
      displayName: 'Receipt one.jpg'
    });
    expect(service.addCandidate({ ...auth, scanId: 'scan-1-repeat', rawValue: LINK_1 }).candidate).toMatchObject({
      status: 'DUPLICATE',
      code: 'DUPLICATE_SESSION'
    });
    expect(service.addCandidate({ ...auth, scanId: 'scan-2', rawValue: LINK_2 }).candidate.code).toBe('ACCEPTED');

    const committed = service.commit({ ...auth, requestId: 'stable-request' });
    expect(committed.result).toMatchObject({
      linkedCount: 2,
      skippedCount: 0,
      summaryCode: 'COMMITTED',
      dataVersion: 8,
      fieldValue: `${LINK_1}, ${LINK_2}`,
      links: [LINK_1, LINK_2]
    });
    expect(record.values.RECEIPTS).toBe(`${LINK_1}, ${LINK_2}`);
    expect(record.values.OTHER_FIELD).toBe('preserve me');
    expect(record.OTHER_FIELD).toBe('preserve me');
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith({
      formKey: 'Config: Receipts',
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_1, LINK_2],
      expectedDataVersion: 7
    });
    expect(service.commit({ ...auth, requestId: 'stable-request' }).result).toEqual(committed.result);
    expect(append).toHaveBeenCalledTimes(1);
    expect((drive.fetchMetadata as jest.Mock).mock.calls.filter(call => call[0] === FILE_1)).toHaveLength(2);

    const persisted = JSON.stringify(properties);
    expect(persisted).not.toContain(invalidRaw);
    expect(persisted).toContain(LINK_1);
    expect(persisted).not.toContain(credentials.accessToken);
  });

  test('reconciles a lost commit response by Drive file ID and returns authoritative field state', () => {
    const { append, crypto, record, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });

    const requestId = 'stable-request';
    sessions.mutate(credentials.sessionId, current => ({
      ...current,
      status: 'COMMITTING',
      commit: {
        requestIdHash: crypto.hash(requestId),
        startedAt: NOW.toISOString()
      }
    }));
    const storedUrlVariant = `https://drive.google.com/open?id=${FILE_1}`;
    record.values.RECEIPTS = storedUrlVariant;
    record.RECEIPTS = storedUrlVariant;
    record.dataVersion = 8;

    const recovered = service.commit({ ...auth, requestId });

    expect(recovered.result).toMatchObject({
      linkedCount: 1,
      dataVersion: 8,
      fieldValue: storedUrlVariant,
      links: [storedUrlVariant]
    });
    expect(append).not.toHaveBeenCalled();
  });

  test('keeps an ambiguous append failure committing and reconciles the durable write on retry', () => {
    const { append, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });
    const durableAppend = append.getMockImplementation();
    if (!durableAppend) throw new Error('append implementation missing');
    (append as jest.Mock<any, [any]>).mockImplementationOnce((request: any) => {
      durableAppend(request);
      return {
        success: false,
        code: 'TEMPORARY_ERROR' as const,
        message: 'response lost after write'
      };
    });

    expect(() => service.commit({ ...auth, requestId: 'stable-request' })).toThrow(
      expect.objectContaining({ code: 'TEMPORARY_ERROR', retryable: true })
    );
    expect(record.values.RECEIPTS).toBe(LINK_1);
    expect(service.getSession(auth).session.status).toBe('COMMITTING');

    const recovered = service.commit({ ...auth, requestId: 'stable-request' });
    expect(recovered.result).toMatchObject({
      linkedCount: 1,
      dataVersion: 8,
      fieldValue: LINK_1,
      links: [LINK_1]
    });
    expect(append).toHaveBeenCalledTimes(1);
  });

  test('recovers when final session persistence fails after a successful field append', () => {
    const { append, record, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });
    const mutate = sessions.mutate.bind(sessions);
    let completionFailuresRemaining = 2;
    jest.spyOn(sessions, 'mutate').mockImplementation((sessionId, update) =>
      mutate(sessionId, current => {
        const next = update(current);
        if (completionFailuresRemaining > 0 && next?.status === 'COMPLETED') {
          completionFailuresRemaining -= 1;
          throw new Error('session completion unavailable');
        }
        return next;
      })
    );

    expect(() => service.commit({ ...auth, requestId: 'stable-request' })).toThrow(
      'session completion unavailable'
    );
    expect(record.values.RECEIPTS).toBe(LINK_1);
    expect(service.getSession(auth).session.status).toBe('COMMITTING');

    expect(() => service.commit({ ...auth, requestId: 'stable-request' })).toThrow(
      'session completion unavailable'
    );
    expect(service.getSession(auth).session.status).toBe('COMMITTING');

    const recovered = service.commit({ ...auth, requestId: 'stable-request' });
    expect(recovered.result).toMatchObject({
      linkedCount: 1,
      dataVersion: 8,
      fieldValue: LINK_1,
      links: [LINK_1]
    });
    expect(append).toHaveBeenCalledTimes(1);
  });

  test('stops a commit when the authoritative record version changed and leaves it retryable as active', () => {
    const { record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });
    record.dataVersion = 8;

    expect(() => service.commit({ ...auth, requestId: 'stable-request' })).toThrow(
      expect.objectContaining({ code: 'RECORD_CHANGED' })
    );
    expect(service.getSession(auth).session.status).toBe('ACTIVE');
  });

  test.each([
    [{ trashed: true }, 'TRASHED'],
    [{ mimeType: 'text/plain', name: 'receipt.txt' }, 'UNSUPPORTED_TYPE'],
    [{ parentIds: ['8AbCdEfGhIjKlMnOpQrStUvWxYz'] }, 'NOT_AUTHORISED_OR_UNAVAILABLE'],
    [{ shortcut: true }, 'NOT_AUTHORISED_OR_UNAVAILABLE']
  ])('returns a typed permanent rejection without exposing Drive errors', (metadataOverride, code) => {
    const { service } = makeHarness(makeDrive({ [FILE_1]: metadataOverride }));
    const credentials = launchAndRedeem(service);
    const result = service.addCandidate({
      sessionId: credentials.sessionId,
      accessToken: credentials.accessToken,
      scanId: 'scan-1',
      rawValue: LINK_1
    });
    expect(result.candidate).toMatchObject({ status: 'REJECTED', code });
  });

  test('accepts any non-folder MIME type when link capture has an explicit wildcard policy', () => {
    const { service } = makeHarness(
      makeDrive({ [FILE_1]: { mimeType: 'text/plain', name: 'receipt.txt' } }),
      ['*/*']
    );
    const credentials = launchAndRedeem(service);
    const result = service.addCandidate({
      sessionId: credentials.sessionId,
      accessToken: credentials.accessToken,
      scanId: 'scan-any-mime',
      rawValue: LINK_1
    });
    expect(result.candidate).toMatchObject({ status: 'AUTHORISED', code: 'ACCEPTED' });
  });

  test('cancels idempotently and returns to the exact record', () => {
    const { service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    const first = service.cancel(auth);
    const second = service.cancel(auth);
    expect(second).toEqual(first);
    expect(first.status).toBe('CANCELLED');
    expect(first.returnUrl).toContain('recordId=REC-1');
    expect(first.returnUrl).toContain('qrResult=cancelled');
  });
});
