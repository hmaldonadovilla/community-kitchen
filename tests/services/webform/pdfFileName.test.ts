import { resolveRecordFileLabel } from '../../../src/services/webform/followup/docRenderer.copy';
import { FormConfig, WebFormSubmission } from '../../../src/types';

describe('resolveRecordFileLabel', () => {
  it('uses the configured field id when present', () => {
    const form = {
      title: 'Meal Production',
      followupConfig: {
        pdfFileNameFieldId: 'MP_ID'
      }
    } as FormConfig;
    const record = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'REC-001',
      values: {
        MP_ID: 'MP-123'
      }
    } as WebFormSubmission;

    expect(resolveRecordFileLabel(form, record)).toBe('MP-123');
  });

  it('falls back to record id when configured value is empty', () => {
    const form = {
      title: 'Meal Production',
      followupConfig: {
        pdfFileNameFieldId: 'MP_ID'
      }
    } as FormConfig;
    const record = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'REC-002',
      values: {
        MP_ID: ''
      }
    } as WebFormSubmission;

    expect(resolveRecordFileLabel(form, record)).toBe('REC-002');
  });

  it('supports meta field ids', () => {
    const form = {
      title: 'Meal Production',
      followupConfig: {
        pdfFileNameFieldId: 'id'
      }
    } as FormConfig;
    const record = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'REC-003',
      values: {}
    } as WebFormSubmission;

    expect(resolveRecordFileLabel(form, record)).toBe('REC-003');
  });
});
