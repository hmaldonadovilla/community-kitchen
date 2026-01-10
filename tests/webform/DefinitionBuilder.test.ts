import '../mocks/GoogleAppsScript';
import { DefinitionBuilder } from '../../src/services/webform/definitionBuilder';
import { Dashboard } from '../../src/config/Dashboard';
import { MockSpreadsheet } from '../mocks/GoogleAppsScript';

describe('DefinitionBuilder', () => {
  let ss: MockSpreadsheet;
  let builder: DefinitionBuilder;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      pdfTemplateId: { EN: 'pdf-en' },
      emailTemplateId: { EN: 'email-en' },
      statusTransitions: { onEmail: 'Sent' },
      listView: { title: { en: 'Pantry Records' }, headerSortEnabled: false },
      listViewMetaColumns: ['createdAt', 'status'],
      listViewLegend: [{ icon: 'warning', text: { en: 'Needs attention' } }],
      createButtonLabel: { EN: 'New' },
      copyCurrentRecordLabel: { EN: 'Duplicate' },
      copyCurrentRecordDropFields: ['Q1'],
      languages: ['EN', 'FR', 'NL'],
      defaultLanguage: 'FR',
      languageSelectorEnabled: false,
      createRecordPresetButtonsEnabled: false,
      actionBars: { system: { home: { hideWhenActive: true } } }
    });
    dashboardSheet?.setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Pantry Form', 'Config: Pantry', 'Pantry Responses', 'Desc', '', '', '', followupJson]
    ]);

    const configSheet = ss.insertSheet('Config: Pantry');
    configSheet.setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['Q1', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['Q2', 'FILE_UPLOAD', 'Receipt', 'Reçu', 'Bon', false, '', '', '', 'Active', '{"maxFiles":1}', '', '', '', '']
    ]);

    const dedupSheet = ss.insertSheet('Config: Pantry Dedup');
    dedupSheet.setMockData([
      ['ID', 'Scope', 'Keys', 'Match Mode', 'On Conflict', 'Message'],
      ['rule-1', 'form', 'Q1', 'exact', 'reject', 'Duplicate name']
    ]);

    builder = new DefinitionBuilder(ss as any, new Dashboard(ss as any));
  });

  test('buildDefinition includes dedup rules and list view config', () => {
    const def = builder.buildDefinition('Config: Pantry');
    expect(def.dedupRules?.[0]?.id).toBe('rule-1');
    expect(def.listView?.columns.map(col => col.fieldId)).toContain('Q1');
    expect(def.listView?.legend).toEqual([{ icon: 'warning', text: { en: 'Needs attention' } }]);
    expect(def.listView?.title).toEqual({ en: 'Pantry Records' });
    expect(def.listView?.headerSortEnabled).toBe(false);
    expect(def.createButtonLabel).toEqual({ en: 'New' });
    expect(def.copyCurrentRecordLabel).toEqual({ en: 'Duplicate' });
    expect(def.copyCurrentRecordDropFields).toEqual(['Q1']);
    const metaColumns = (def.listView?.columns || [])
      .filter((col): col is { fieldId: string; kind: 'meta' } => (col as any).kind === 'meta')
      .map(col => col.fieldId);
    expect(metaColumns).toEqual(['createdAt', 'status']);
  });

  test('buildDefinition respects language config from the dashboard', () => {
    const def = builder.buildDefinition('Config: Pantry');
    expect(def.defaultLanguage).toBe('FR');
    expect(def.languageSelectorEnabled).toBe(false);
    // When language selector is disabled, the web app should only expose the default language.
    expect(def.languages).toEqual(['FR']);
  });

  test('buildDefinition includes action bar config and button feature flags from the dashboard', () => {
    const def = builder.buildDefinition('Config: Pantry');
    expect(def.createRecordPresetButtonsEnabled).toBe(false);
    expect(def.actionBars?.system?.home?.hideWhenActive).toBe(true);
  });
});
