import { validateQrScanSessionLaunchRequest } from '../../../src/services/webform/qrScanLaunch';

describe('QR scan launch boundary validation', () => {
  test('keeps identifiers and whitelisted return navigation only', () => {
    expect(
      validateQrScanSessionLaunchRequest({
        formKey: ' Config: Receipts ',
        recordId: ' REC-1 ',
        fieldId: ' RECEIPTS ',
        expectedDataVersion: 7,
        language: 'nl',
        returnContext: { app: 'meal-production', stepId: 'production', overlay: 'files' },
        uploadConfig: { linkCapture: { validation: { allowedFolderIds: ['attacker-folder'] } } },
        returnUrl: 'https://attacker.example.test/'
      })
    ).toEqual({
      request: {
        formKey: 'Config: Receipts',
        recordId: 'REC-1',
        fieldId: 'RECEIPTS',
        expectedDataVersion: 7,
        language: 'NL',
        returnContext: { app: 'meal-production', stepId: 'production', overlay: 'files' }
      }
    });
  });

  test.each([
    null,
    {},
    { formKey: 'form', recordId: 'record', fieldId: '' },
    { formKey: 'form', recordId: 'record', fieldId: 'field', expectedDataVersion: 0 },
    { formKey: 'form', recordId: 'record', fieldId: 'field', language: 'DE' },
    {
      formKey: 'form',
      recordId: 'record',
      fieldId: 'field',
      returnContext: { page: 'https://attacker.example.test/' }
    },
    { formKey: 'form', recordId: 'record', fieldId: 'field', returnContext: { overlay: 'camera' } }
  ])('rejects malformed or non-canonical browser input', request => {
    expect(validateQrScanSessionLaunchRequest(request).error).toEqual(
      expect.objectContaining({ success: false, code: 'INVALID_REQUEST' })
    );
  });
});
