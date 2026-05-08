const stableStringify = (value: any): string => {
  const seen = new WeakSet<object>();
  const normalize = (input: any): any => {
    if (input === null || input === undefined) return input;
    const inputType = typeof input;
    if (inputType === 'string' || inputType === 'number' || inputType === 'boolean') return input;
    if (Array.isArray(input)) return input.map(normalize);
    if (inputType === 'object') {
      if (seen.has(input)) return '[Circular]';
      seen.add(input);
      try {
        if (typeof input.toJSON === 'function') return normalize(input.toJSON());
      } catch {
        // ignore
      }
      const output: Record<string, any> = {};
      Object.keys(input)
        .sort()
        .forEach(key => {
          output[key] = normalize(input[key]);
        });
      return output;
    }
    try {
      return String(input);
    } catch {
      return '';
    }
  };
  return JSON.stringify(normalize(value));
};

const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
};

export type DraftSaveFingerprint = {
  recordId: string;
  fingerprint: string;
};

export type DraftStateFingerprintArgs = {
  formKey?: string | null;
  language?: string | null;
  values?: Record<string, any> | null;
  lineItems?: Record<string, any> | null;
};

export const buildDraftSaveFingerprint = (payload: any): DraftSaveFingerprint | null => {
  const recordId = ((payload?.id || '') as any).toString?.().trim?.() || '';
  if (!recordId) return null;
  const fingerprintPayload = {
    formKey: (payload?.formKey || payload?.form || '').toString(),
    id: recordId,
    language: payload?.language || '',
    values: payload?.values || {},
    saveMode: (payload?.__ckSaveMode || '').toString(),
    status: (payload?.__ckStatus ?? payload?.status ?? '').toString(),
    allowClosedUpdate: Boolean(payload?.__ckAllowClosedUpdate),
    auditAction: (payload?.__ckAuditAction || '').toString(),
    deleteRecordId: (payload?.__ckDeleteRecordId || '').toString()
  };
  return {
    recordId,
    fingerprint: fnv1a32(stableStringify(fingerprintPayload))
  };
};

export const buildCompletedDraftSaveFingerprint = (
  payload: any,
  recordId?: string | null
): DraftSaveFingerprint | null => {
  const completedRecordId = ((recordId || payload?.id || '') as any).toString?.().trim?.() || '';
  if (!completedRecordId) return null;
  return buildDraftSaveFingerprint({
    ...payload,
    id: completedRecordId
  });
};

export const buildDraftStateFingerprint = (args: DraftStateFingerprintArgs): string =>
  fnv1a32(
    stableStringify({
      formKey: (args.formKey || '').toString(),
      language: (args.language || '').toString(),
      values: args.values || {},
      lineItems: args.lineItems || {}
    })
  );
