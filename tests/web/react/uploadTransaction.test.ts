import { buildUploadDraftPayload } from '../../../src/web/react/app/submission';
import {
  applyUploadValueToFormState,
  applyUploadValueToPayloadValues,
  buildUploadNonTargetFingerprint,
  extractUploadValueFromMeta,
  resolveUploadTransactionTarget,
  splitUploadValue
} from '../../../src/web/react/app/uploadTransactionState';
import { resolveUploadBlockUntilSaved } from '../../../src/web/react/app/uploadTransaction';

describe('upload transaction helpers', () => {
  beforeAll(() => {
    if (typeof (globalThis as any).File === 'undefined') {
      (globalThis as any).File = class TestFile {
        public name: string;
        public type: string;
        public lastModified: number;
        public size: number;

        constructor(parts: string[], name: string, opts?: { type?: string; lastModified?: number }) {
          this.name = name;
          this.type = opts?.type || '';
          this.lastModified = opts?.lastModified || 0;
          this.size = parts.join('').length;
        }
      };
    }
    (globalThis as any).FileReader = class TestFileReader {
      public result = '';
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;

      readAsDataURL(file: File) {
        this.result = `data:${file.type || 'application/octet-stream'};base64,dGVzdA==`;
        if (this.onload) this.onload();
      }
    };
  });

  it('resolves per-field blocking config', () => {
    expect(resolveUploadBlockUntilSaved({ blockUntilSaved: true })).toBe(true);
    expect(resolveUploadBlockUntilSaved({ wait_for_save: 'yes' })).toBe(true);
    expect(resolveUploadBlockUntilSaved({ blockUntilSaved: false })).toBe(false);
    expect(resolveUploadBlockUntilSaved({})).toBe(false);
  });

  it('resolves valid top-level and line-item upload targets', () => {
    expect(resolveUploadTransactionTarget({ scope: 'top', questionId: 'PHOTO' })).toEqual({
      scope: 'top',
      questionId: 'PHOTO'
    });
    expect(
      resolveUploadTransactionTarget({
        scope: 'line',
        groupId: 'GROUP',
        rowId: 'row-1',
        fieldId: 'LINE_PHOTO'
      })
    ).toEqual({
      scope: 'line',
      groupId: 'GROUP',
      rowId: 'row-1',
      fieldId: 'LINE_PHOTO'
    });
    expect(resolveUploadTransactionTarget({ scope: 'line', groupId: 'GROUP', rowId: 'row-1' })).toBeNull();
  });

  it('builds a draft upload payload with file payloads only for the target field', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg', lastModified: 123 });
    const payload = await buildUploadDraftPayload({
      definition: {
        title: 'Upload Test',
        questions: [
          { id: 'PHOTO', type: 'FILE_UPLOAD', uploadConfig: { maxFiles: 3 } } as any,
          { id: 'OTHER_PHOTO', type: 'FILE_UPLOAD', uploadConfig: { maxFiles: 3 } } as any
        ]
      } as any,
      formKey: 'Config: Upload Test',
      language: 'EN',
      values: {
        PHOTO: ['https://example.com/existing.jpg', file] as any,
        OTHER_PHOTO: [file] as any
      },
      lineItems: {},
      existingRecordId: 'rec-1',
      target: { scope: 'top', questionId: 'PHOTO' }
    });

    expect(payload.id).toBe('rec-1');
    expect(payload.values.PHOTO[0]).toBe('https://example.com/existing.jpg');
    expect(payload.values.PHOTO[1]).toMatchObject({
      name: 'photo.jpg',
      type: 'image/jpeg'
    });
    expect(typeof payload.values.PHOTO[1].dataUrl).toBe('string');
    expect(payload.values.OTHER_PHOTO).toBe('');
  });

  it('extracts and applies server upload values', () => {
    expect(splitUploadValue('https://a.test/1, https://a.test/2')).toEqual([
      'https://a.test/1',
      'https://a.test/2'
    ]);
    expect(
      extractUploadValueFromMeta(
        {
          top: { PHOTO: 'https://a.test/1' },
          line: [{ groupId: 'GROUP', rowId: 'row-1', fieldId: 'LINE_PHOTO', value: 'https://a.test/2' }]
        },
        { scope: 'line', groupId: 'GROUP', rowId: 'row-1', fieldId: 'LINE_PHOTO' }
      )
    ).toBe('https://a.test/2');

    const next = applyUploadValueToFormState({
      values: {},
      lineItems: {
        GROUP: [{ id: 'row-1', values: { LINE_PHOTO: [] } }]
      },
      target: { scope: 'line', groupId: 'GROUP', rowId: 'row-1', fieldId: 'LINE_PHOTO' },
      value: 'https://a.test/2'
    });

    expect(next.lineItems.GROUP[0].values.LINE_PHOTO).toEqual(['https://a.test/2']);
  });

  it('updates nested serialized payload rows by subgroup key', () => {
    const next = applyUploadValueToPayloadValues({
      payloadValues: {
        GROUP: [{ __ckRowId: 'parent-1', SUB: [{ __ckRowId: 'child-1', LINE_PHOTO: '' }] }]
      },
      target: {
        scope: 'line',
        groupId: 'GROUP::parent-1::SUB',
        rowId: 'child-1',
        fieldId: 'LINE_PHOTO'
      },
      value: 'https://a.test/child.jpg'
    });

    expect(next.GROUP[0].SUB[0].LINE_PHOTO).toBe('https://a.test/child.jpg');
    expect(JSON.parse(next.GROUP_json)[0].SUB[0].LINE_PHOTO).toBe('https://a.test/child.jpg');
  });

  it('fingerprints non-target changes independently from target file changes', () => {
    const base = buildUploadNonTargetFingerprint({
      values: { PHOTO: ['a'], NOTE: 'same' } as any,
      lineItems: {},
      target: { scope: 'top', questionId: 'PHOTO' }
    });
    const targetChanged = buildUploadNonTargetFingerprint({
      values: { PHOTO: ['b'], NOTE: 'same' } as any,
      lineItems: {},
      target: { scope: 'top', questionId: 'PHOTO' }
    });
    const otherChanged = buildUploadNonTargetFingerprint({
      values: { PHOTO: ['a'], NOTE: 'changed' } as any,
      lineItems: {},
      target: { scope: 'top', questionId: 'PHOTO' }
    });

    expect(targetChanged).toBe(base);
    expect(otherChanged).not.toBe(base);
  });
});
