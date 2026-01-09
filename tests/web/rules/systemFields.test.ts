import { getSystemFieldValue, normalizeSystemFieldId } from '../../../src/web/rules/systemFields';

describe('systemFields', () => {
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
  });
});

