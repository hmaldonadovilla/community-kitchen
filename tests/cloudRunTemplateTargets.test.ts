const {
  collectTemplateIdsFromMap,
  collectTemplatePrefetchIds,
  isBundledHtmlPdfTemplate
} = require('../cloud-run/api/domain/templateTargets');

describe('Cloud Run template target domain', () => {
  test('collects ids from conditional maps and prefetch groups by renderer type', () => {
    expect(
      collectTemplateIdsFromMap({
        cases: [{ templateId: { en: 'case-en' } }, { templateId: 'case-2' }],
        default: 'default-doc'
      })
    ).toEqual(['case-en', 'case-2', 'default-doc']);

    const result = collectTemplatePrefetchIds(
      {
        summaryHtmlTemplateId: 'summary-html',
        followupConfig: {
          pdfTemplateId: 'pdf-doc',
          emailTemplateId: { en: 'email-en', fr: 'email-fr' }
        }
      },
      [
        { type: 'BUTTON', button: { action: 'renderMarkdownTemplate', templateId: 'button-md' } },
        { type: 'BUTTON', button: { action: 'renderHtmlTemplate', templateId: 'button-html' } },
        { type: 'BUTTON', button: { action: 'renderDocTemplate', templateId: 'button-doc' } }
      ]
    );

    expect(result).toEqual({
      htmlIds: ['summary-html', 'button-html'],
      markdownIds: ['button-md'],
      docIds: ['pdf-doc', 'email-en', 'email-fr', 'button-doc']
    });
  });

  test('classifies bundled HTML PDF follow-up templates as HTML prefetch targets', () => {
    const result = collectTemplatePrefetchIds(
      {
        followupConfig: {
          pdfTemplateId: {
            EN: 'bundle:meal_production.pdf.html',
            FR: 'google-doc-template-id'
          },
          emailTemplateId: 'email-template-id'
        }
      },
      []
    );

    expect(isBundledHtmlPdfTemplate('bundle:meal_production.pdf.html')).toBe(true);
    expect(result.htmlIds).toContain('bundle:meal_production.pdf.html');
    expect(result.docIds).toContain('google-doc-template-id');
    expect(result.docIds).toContain('email-template-id');
    expect(result.docIds).not.toContain('bundle:meal_production.pdf.html');
  });
});
