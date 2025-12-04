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
      listViewMetaColumns: ['createdAt', 'status']
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
    const metaColumns = def.listView?.columns.filter(col => col.kind === 'meta').map(col => col.fieldId);
    expect(metaColumns).toEqual(['createdAt', 'status']);
  });
});
