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

  test('checks and incrementally attaches multiple candidates while leaving the session active', () => {
    const { append, drive, properties, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };

    const invalidRaw = 'not a drive URL';
    expect(service.addCandidate({ ...auth, scanId: 'scan-invalid', rawValue: invalidRaw }).candidate).toMatchObject({
      status: 'REJECTED',
      code: 'INVALID_PAYLOAD'
    });
    const first = service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });
    expect(first.candidate).toMatchObject({
      status: 'AUTHORISED',
      code: 'ACCEPTED',
      displayName: 'Receipt one.jpg'
    });
    expect(first.committed).toMatchObject({
      linkedCount: 1,
      recordId: 'REC-1',
      dataVersion: 8,
      fieldValue: LINK_1,
      links: [LINK_1],
      summaryCode: 'COMMITTED',
      idempotent: false
    });
    expect(first.session.status).toBe('ACTIVE');
    expect(service.addCandidate({ ...auth, scanId: 'scan-1-repeat', rawValue: LINK_1 }).candidate).toMatchObject({
      status: 'DUPLICATE',
      code: 'ALREADY_LINKED'
    });
    const second = service.addCandidate({ ...auth, scanId: 'scan-2', rawValue: LINK_2 });
    expect(second.candidate.code).toBe('ACCEPTED');
    expect(second.committed).toMatchObject({
      linkedCount: 1,
      summaryCode: 'COMMITTED',
      dataVersion: 9,
      fieldValue: `${LINK_1}, ${LINK_2}`,
      links: [LINK_1, LINK_2]
    });
    expect(record.values.RECEIPTS).toBe(`${LINK_1}, ${LINK_2}`);
    expect(record.values.OTHER_FIELD).toBe('preserve me');
    expect(record.OTHER_FIELD).toBe('preserve me');
    expect(record.dataVersion).toBe(9);
    expect(service.getSession(auth).session.status).toBe('ACTIVE');
    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenNthCalledWith(1, {
      formKey: 'Config: Receipts',
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_1],
      expectedDataVersion: 7
    });
    expect(append).toHaveBeenNthCalledWith(2, {
      formKey: 'Config: Receipts',
      recordId: 'REC-1',
      fieldId: 'RECEIPTS',
      links: [LINK_2],
      expectedDataVersion: 8
    });
    expect((drive.fetchMetadata as jest.Mock).mock.calls.filter(call => call[0] === FILE_1)).toHaveLength(1);

    const persisted = JSON.stringify(properties);
    expect(persisted).not.toContain(invalidRaw);
    expect(persisted).toContain(FILE_1);
    expect(persisted).not.toContain(credentials.accessToken);
  });

  test('compacts acknowledged candidates while preserving counts for larger scanner limits', () => {
    const drive: QrScannerDriveRepository = {
      fetchMetadata: jest.fn(fileId => ({
        id: fileId,
        name: `${fileId}.pdf`,
        mimeType: 'application/pdf',
        trashed: false,
        parentIds: [FOLDER],
        shortcut: false
      }))
    };
    const { record, service, sessions } = makeHarness(drive, ['*/*']);
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    sessions.mutate(credentials.sessionId, current => ({
      ...current,
      maxFiles: 20,
      maxAttempts: 40
    }));

    let latest: ReturnType<typeof service.addCandidate> | null = null;
    for (let index = 0; index < 15; index += 1) {
      const fileId = `1ReceiptFile${index.toString().padStart(2, '0')}AbCdEfGhIjKlMn`;
      latest = service.addCandidate({
        ...auth,
        scanId: `scan-${index}`,
        rawValue: `https://drive.google.com/file/d/${fileId}/view`
      });
    }

    expect(latest?.counts).toMatchObject({ accepted: 15, authorised: 15, remaining: 5 });
    expect(latest?.session.candidates).toHaveLength(12);
    expect((record.values.RECEIPTS || '').split(', ')).toHaveLength(15);
    expect(record.dataVersion).toBe(22);
  });

  test('reconciles a lost commit response by Drive file ID and returns authoritative field state', () => {
    const { append, crypto, record, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });
    append.mockClear();

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
    append.mockClear();
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
    append.mockClear();
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
    record.dataVersion = 9;

    expect(() => service.commit({ ...auth, requestId: 'stable-request' })).toThrow(
      expect.objectContaining({ code: 'RECORD_CHANGED' })
    );
    expect(service.getSession(auth).session.status).toBe('ACTIVE');
  });

  test('replays one scan idempotently without appending or advancing the record twice', () => {
    const { append, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };

    const first = service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 });
    const repeated = service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 });

    expect(first.committed).toMatchObject({ dataVersion: 8, idempotent: false });
    expect(repeated.candidate).toEqual(first.candidate);
    expect(repeated.committed).toMatchObject({
      linkedCount: 1,
      dataVersion: 8,
      fieldValue: LINK_1,
      links: [LINK_1],
      idempotent: true
    });
    expect(repeated.session.status).toBe('ACTIVE');
    expect(record.dataVersion).toBe(8);
    expect(append).toHaveBeenCalledTimes(1);
  });

  test('recovers a durable incremental append when final session persistence fails', () => {
    const { append, record, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    const mutate = sessions.mutate.bind(sessions);
    let failCompletion = true;
    jest.spyOn(sessions, 'mutate').mockImplementation((sessionId, update) =>
      mutate(sessionId, current => {
        const next = update(current);
        if (
          failCompletion &&
          next?.candidates.some(candidate => candidate.incremental?.state === 'COMPLETED')
        ) {
          failCompletion = false;
          throw new Error('incremental completion unavailable');
        }
        return next;
      })
    );

    expect(() => service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 })).toThrow(
      'incremental completion unavailable'
    );
    expect(record.values.RECEIPTS).toBe(LINK_1);
    expect(record.dataVersion).toBe(8);
    expect(service.getSession(auth).session.status).toBe('ACTIVE');

    const recovered = service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 });
    expect(recovered.candidate).toMatchObject({ status: 'AUTHORISED', code: 'ACCEPTED', fileId: FILE_1 });
    expect(recovered.committed).toMatchObject({ dataVersion: 8, idempotent: true, links: [LINK_1] });
    expect(recovered.session.status).toBe('ACTIVE');
    expect(record.dataVersion).toBe(8);
    expect(append).toHaveBeenCalledTimes(2);
  });

  test('does not let legacy commit or cancel overtake an incremental append', () => {
    const { append, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    const appendImplementation = append.getMockImplementation()!;

    append.mockImplementationOnce(request => {
      expect(() => service.commit({ ...auth, requestId: 'legacy-finish' })).toThrow(
        expect.objectContaining({ code: 'TEMPORARY_ERROR', retryable: true })
      );
      expect(() => service.cancel(auth)).toThrow(
        expect.objectContaining({ code: 'TEMPORARY_ERROR', retryable: true })
      );
      return appendImplementation(request);
    });

    const result = service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });
    expect(result.candidate).toMatchObject({ status: 'AUTHORISED', code: 'ACCEPTED' });
    expect(result.session.status).toBe('ACTIVE');
  });

  test('serializes different scan IDs at the server boundary', () => {
    const { append, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    const appendImplementation = append.getMockImplementation()!;
    let concurrentFailure: any;

    append.mockImplementationOnce(request => {
      try {
        service.addCandidate({ ...auth, scanId: 'scan-2', rawValue: LINK_2 });
      } catch (error) {
        concurrentFailure = error;
      }
      return appendImplementation(request);
    });

    const first = service.addCandidate({ ...auth, scanId: 'scan-1', rawValue: LINK_1 });
    expect(concurrentFailure).toMatchObject({ code: 'TEMPORARY_ERROR', retryable: true });
    expect(first.committed).toMatchObject({ dataVersion: 8, links: [LINK_1] });

    const second = service.addCandidate({ ...auth, scanId: 'scan-2', rawValue: LINK_2 });
    expect(second.committed).toMatchObject({ dataVersion: 9, links: [LINK_1, LINK_2] });
    expect(record.dataVersion).toBe(9);
  });

  test('returns the same durable result to concurrent requests with one scan ID', () => {
    const { append, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    const appendImplementation = append.getMockImplementation()!;
    let concurrentCommitted: any = null;

    append.mockImplementationOnce(request => {
      concurrentCommitted = service.addCandidate({ ...auth, scanId: 'same-scan', rawValue: LINK_1 }).committed;
      return appendImplementation(request);
    });

    const firstResult = service.addCandidate({ ...auth, scanId: 'same-scan', rawValue: LINK_1 });
    expect(concurrentCommitted).toMatchObject({ dataVersion: 8, links: [LINK_1] });
    expect(firstResult.committed).toMatchObject({ dataVersion: 8, links: [LINK_1], idempotent: true });
    expect(record.dataVersion).toBe(8);
    expect(append).toHaveBeenCalledTimes(2);
  });

  test('allows same-scan recovery after the global attempt limit is reached', () => {
    const { record, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    const mutate = sessions.mutate.bind(sessions);
    let failCompletion = true;
    jest.spyOn(sessions, 'mutate').mockImplementation((sessionId, update) =>
      mutate(sessionId, current => {
        const next = update(current);
        if (failCompletion && next?.candidates.some(candidate => candidate.incremental?.state === 'COMPLETED')) {
          failCompletion = false;
          throw new Error('incremental completion unavailable');
        }
        return next;
      })
    );

    expect(() => service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 })).toThrow(
      'incremental completion unavailable'
    );
    sessions.mutate(credentials.sessionId, current => ({ ...current, attempts: current.maxAttempts }));

    const recovered = service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 });
    expect(recovered.committed).toMatchObject({ dataVersion: 8, idempotent: true, links: [LINK_1] });
    expect(record.dataVersion).toBe(8);
  });

  test('allows a fresh scan ID to supersede a retryable append for the same file', () => {
    const { append, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    append.mockReturnValueOnce({
      success: false,
      code: 'TEMPORARY_ERROR',
      message: 'temporary failure'
    } as any);

    const failed = service.addCandidate({ ...auth, scanId: 'scan-failed', rawValue: LINK_1 });
    expect(failed.candidate).toMatchObject({ status: 'RETRYABLE_ERROR', code: 'TEMPORARY_ERROR' });

    const rescanned = service.addCandidate({ ...auth, scanId: 'scan-rescanned', rawValue: LINK_1 });
    expect(rescanned.candidate).toMatchObject({ status: 'AUTHORISED', code: 'ACCEPTED' });
    expect(rescanned.committed).toMatchObject({ dataVersion: 8, links: [LINK_1] });
    expect(record.values.RECEIPTS).toBe(LINK_1);
  });

  test('does not adopt an unrelated record version during incremental recovery', () => {
    const { record, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    const mutate = sessions.mutate.bind(sessions);
    let failCompletion = true;
    jest.spyOn(sessions, 'mutate').mockImplementation((sessionId, update) =>
      mutate(sessionId, current => {
        const next = update(current);
        if (failCompletion && next?.candidates.some(candidate => candidate.incremental?.state === 'COMPLETED')) {
          failCompletion = false;
          throw new Error('incremental completion unavailable');
        }
        return next;
      })
    );

    expect(() => service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 })).toThrow(
      'incremental completion unavailable'
    );
    record.OTHER_FIELD = 'changed elsewhere';
    record.values.OTHER_FIELD = 'changed elsewhere';
    record.dataVersion = 9;

    expect(() => service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 })).toThrow(
      expect.objectContaining({ code: 'RECORD_CHANGED' })
    );
  });

  test('does not replay a completed scan across a later unrelated record version', () => {
    const { record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 });
    record.OTHER_FIELD = 'changed elsewhere';
    record.values.OTHER_FIELD = 'changed elsewhere';
    record.dataVersion = 9;

    expect(() => service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 })).toThrow(
      expect.objectContaining({ code: 'RECORD_CHANGED' })
    );
  });

  test('rejects reuse of one scan ID with a different payload', () => {
    const { service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_1 });

    expect(() => service.addCandidate({ ...auth, scanId: 'stable-scan', rawValue: LINK_2 })).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST' })
    );
  });

  test('does not mutate the record when the incremental append is rejected', () => {
    const { append, record, service } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    (append as jest.Mock).mockReturnValueOnce({
      success: false,
      code: 'LIMIT_REACHED',
      message: 'The field is full.'
    });

    const result = service.addCandidate({ ...auth, scanId: 'scan-full', rawValue: LINK_1 });

    expect(result.candidate).toMatchObject({ status: 'REJECTED', code: 'LIMIT_REACHED' });
    expect(result.committed).toBeUndefined();
    expect(result.session.status).toBe('ACTIVE');
    expect(record.values.RECEIPTS).toBe('');
    expect(record.dataVersion).toBe(7);
    expect(append).toHaveBeenCalledTimes(1);
  });

  test('clears PENDING when a successful append reports a conflicting version', () => {
    const { append, record, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    append.mockImplementationOnce(() => {
      record.values.RECEIPTS = LINK_1;
      record.RECEIPTS = LINK_1;
      record.dataVersion = 9;
      return {
        success: true,
        message: 'saved with a conflicting version',
        appendedCount: 1,
        dataVersion: 9,
        fieldValue: LINK_1,
        links: [LINK_1],
        idempotent: false
      };
    });

    const result = service.addCandidate({ ...auth, scanId: 'scan-conflict', rawValue: LINK_1 });
    expect(result.candidate).toMatchObject({ status: 'REJECTED', code: 'RECORD_CHANGED' });
    expect(result.committed).toBeUndefined();
    expect(sessions.get(credentials.sessionId)?.candidates[0]?.incremental).toBeUndefined();
    expect(service.cancel(auth).status).toBe('CANCELLED');
  });

  test('makes malformed successful append metadata retryable without stranding PENDING', () => {
    const { append, service, sessions } = makeHarness();
    const credentials = launchAndRedeem(service);
    const auth = { sessionId: credentials.sessionId, accessToken: credentials.accessToken };
    append.mockReturnValueOnce({
      success: true,
      message: 'response metadata unavailable',
      appendedCount: 1,
      fieldValue: LINK_1,
      links: [LINK_1],
      idempotent: false
    } as any);

    const result = service.addCandidate({ ...auth, scanId: 'scan-malformed', rawValue: LINK_1 });
    expect(result.candidate).toMatchObject({ status: 'RETRYABLE_ERROR', code: 'TEMPORARY_ERROR' });
    expect(result.committed).toBeUndefined();
    expect(sessions.get(credentials.sessionId)?.candidates[0]?.incremental?.state).toBe('RETRYABLE');
    expect(service.cancel(auth).status).toBe('CANCELLED');
  });

  test.each([
    [{ trashed: true }, 'TRASHED'],
    [{ mimeType: 'text/plain', name: 'receipt.txt' }, 'UNSUPPORTED_TYPE'],
    [{ parentIds: ['8AbCdEfGhIjKlMnOpQrStUvWxYz'] }, 'NOT_AUTHORISED_OR_UNAVAILABLE'],
    [{ shortcut: true }, 'NOT_AUTHORISED_OR_UNAVAILABLE']
  ])('returns a typed permanent rejection without exposing Drive errors', (metadataOverride, code) => {
    const { append, record, service } = makeHarness(makeDrive({ [FILE_1]: metadataOverride }));
    const credentials = launchAndRedeem(service);
    const result = service.addCandidate({
      sessionId: credentials.sessionId,
      accessToken: credentials.accessToken,
      scanId: 'scan-1',
      rawValue: LINK_1
    });
    expect(result.candidate).toMatchObject({ status: 'REJECTED', code });
    expect(result.committed).toBeUndefined();
    expect(append).not.toHaveBeenCalled();
    expect(record.values.RECEIPTS).toBe('');
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
