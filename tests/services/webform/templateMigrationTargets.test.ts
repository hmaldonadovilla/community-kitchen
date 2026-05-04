import {
  collectDocTemplateMigrationIds,
  collectDocTemplateMigrationTargets,
  collectTemplateIdsFromMap
} from '../../../src/services/webform/followup/templateMigration';

describe('template migration target domain', () => {
  test('collects ids from direct, localized, and conditional template maps', () => {
    expect(collectTemplateIdsFromMap('doc-1' as any)).toEqual(['doc-1']);
    expect(collectTemplateIdsFromMap({ en: 'doc-en', fr: 'doc-fr' } as any)).toEqual(['doc-en', 'doc-fr']);
    expect(
      collectTemplateIdsFromMap({
        cases: [{ templateId: { en: 'case-en' } }, { templateId: 'case-2' }],
        default: 'default-doc'
      } as any)
    ).toEqual(['case-en', 'case-2', 'default-doc']);
  });

  test('collects only Google Doc migration targets from follow-up and Doc buttons', () => {
    const form: any = {
      followupConfig: {
        pdfTemplateId: 'pdf-doc',
        emailTemplateId: { en: 'email-en', fr: 'email-fr' }
      }
    };
    const questions: any[] = [
      { id: 'DOC_BTN', type: 'BUTTON', button: { action: 'renderDocTemplate', templateId: 'button-doc' } },
      { id: 'HTML_BTN', type: 'BUTTON', button: { action: 'renderHtmlTemplate', templateId: 'button-html' } }
    ];

    expect(collectDocTemplateMigrationTargets(form, questions).map(target => target.source)).toEqual([
      'followup.pdfTemplateId',
      'followup.emailTemplateId',
      'button:DOC_BTN'
    ]);
    expect(collectDocTemplateMigrationIds(form, questions)).toEqual(['pdf-doc', 'email-en', 'email-fr', 'button-doc']);
  });
});
