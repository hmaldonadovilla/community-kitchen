export type SystemRecordMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
  pdfUrl?: string;
};

export type SystemFieldId = keyof SystemRecordMeta;

/**
 * Normalize user-provided field ids to system/meta field keys.
 *
 * This exists because config authors commonly reference system fields using sheet-like names
 * (e.g. "STATUS", "PDF_URL"), while the web app stores them under canonical keys
 * (e.g. "status", "pdfUrl").
 */
export const normalizeSystemFieldId = (rawFieldId: string): SystemFieldId | null => {
  const raw = (rawFieldId || '').toString().trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (key === 'status') return 'status';
  if (key === 'pdfurl' || key === 'pdf_url' || key === 'pdf') return 'pdfUrl';
  if (key === 'id' || key === 'recordid' || key === 'record_id' || key === 'record id') return 'id';
  if (key === 'createdat' || key === 'created_at' || key === 'created') return 'createdAt';
  if (key === 'updatedat' || key === 'updated_at' || key === 'updated') return 'updatedAt';
  return null;
};

export const getSystemFieldValue = (fieldId: string, meta?: SystemRecordMeta | null): unknown => {
  const key = normalizeSystemFieldId(fieldId);
  if (!key) return undefined;
  return (meta as any)?.[key];
};

