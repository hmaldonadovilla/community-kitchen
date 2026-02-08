import { getSystemFieldValue, normalizeSystemFieldId } from '../../../src/web/rules/systemFields';

describe('systemFields', () => {
  const globalAny = globalThis as any;
  const originalRequestParams = globalAny.__WEB_FORM_REQUEST_PARAMS__;
  const originalBootstrap = globalAny.__WEB_FORM_BOOTSTRAP__;
  const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalAny, 'location');

  const setMockLocation = (value: { search?: string; hash?: string }) => {
    const next = {
      search: value.search || '',
      hash: value.hash || ''
    };
    try {
      Object.defineProperty(globalAny, 'location', {
        configurable: true,
        writable: true,
        value: next
      });
    } catch (_) {
      globalAny.location = next;
    }
  };

  beforeEach(() => {
    delete globalAny.__WEB_FORM_REQUEST_PARAMS__;
    delete globalAny.__WEB_FORM_BOOTSTRAP__;
  });

  afterAll(() => {
    if (originalRequestParams === undefined) {
      delete globalAny.__WEB_FORM_REQUEST_PARAMS__;
    } else {
      globalAny.__WEB_FORM_REQUEST_PARAMS__ = originalRequestParams;
    }

    if (originalBootstrap === undefined) {
      delete globalAny.__WEB_FORM_BOOTSTRAP__;
    } else {
      globalAny.__WEB_FORM_BOOTSTRAP__ = originalBootstrap;
    }

    if (originalLocationDescriptor) {
      Object.defineProperty(globalAny, 'location', originalLocationDescriptor);
    } else {
      delete globalAny.location;
    }
  });

  describe('normalizeSystemFieldId', () => {
    it('normalizes STATUS (case-insensitive)', () => {
      expect(normalizeSystemFieldId('STATUS')).toBe('status');
      expect(normalizeSystemFieldId('status')).toBe('status');
      expect(normalizeSystemFieldId(' Status ')).toBe('status');
    });

    it('normalizes pdf url aliases', () => {
      expect(normalizeSystemFieldId('pdfUrl')).toBe('pdfUrl');
      expect(normalizeSystemFieldId('PDF_URL')).toBe('pdfUrl');
      expect(normalizeSystemFieldId('pdf')).toBe('pdfUrl');
    });

    it('normalizes id/createdAt/updatedAt aliases', () => {
      expect(normalizeSystemFieldId('id')).toBe('id');
      expect(normalizeSystemFieldId('record_id')).toBe('id');
      expect(normalizeSystemFieldId('created_at')).toBe('createdAt');
      expect(normalizeSystemFieldId('updatedat')).toBe('updatedAt');
    });

    it('returns null for non-system fields', () => {
      expect(normalizeSystemFieldId('')).toBeNull();
      expect(normalizeSystemFieldId('NOT_A_FIELD')).toBeNull();
    });
  });

  describe('getSystemFieldValue', () => {
    it('returns system values when present (including null)', () => {
      const meta = { status: 'Closed', pdfUrl: 'https://example.com', id: 'R1', createdAt: 'c', updatedAt: 'u' };
      expect(getSystemFieldValue('STATUS', meta)).toBe('Closed');
      expect(getSystemFieldValue('pdf_url', meta)).toBe('https://example.com');
      expect(getSystemFieldValue('id', meta)).toBe('R1');
      expect(getSystemFieldValue('createdAt', meta)).toBe('c');
      expect(getSystemFieldValue('updated_at', meta)).toBe('u');

      expect(getSystemFieldValue('status', { status: null })).toBeNull();
    });

    it('returns undefined when field is not a system field or meta is missing', () => {
      expect(getSystemFieldValue('FOO', { status: 'Closed' } as any)).toBeUndefined();
      expect(getSystemFieldValue('STATUS', null)).toBeUndefined();
      expect(getSystemFieldValue('STATUS', undefined)).toBeUndefined();
    });

    it('resolves request params from injected request params with __ckRequestParam_<name>', () => {
      globalAny.__WEB_FORM_REQUEST_PARAMS__ = { admin: 'true' };
      expect(getSystemFieldValue('__ckRequestParam_admin', {} as any)).toBe('true');
    });

    it('resolves request params from bootstrap request params when direct params are missing', () => {
      globalAny.__WEB_FORM_BOOTSTRAP__ = { requestParams: { Admin: 'YES' } };
      expect(getSystemFieldValue('__ckRequestParam_admin', {} as any)).toBe('YES');
    });

    it('resolves request params from location search/hash as a fallback', () => {
      setMockLocation({ search: '?admin=true', hash: '#foo?mode=x' });
      expect(getSystemFieldValue('__ckRequestParam_admin', {} as any)).toBe('true');

      setMockLocation({ search: '', hash: '#admin=yes' });
      expect(getSystemFieldValue('__ckRequestParam_admin', {} as any)).toBe('yes');
    });
  });
});
