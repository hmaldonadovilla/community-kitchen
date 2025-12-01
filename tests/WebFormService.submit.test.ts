import './mocks/GoogleAppsScript';
import { WebFormService } from '../src/services/WebFormService';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';

describe('WebFormService submitWebForm', () => {
  test('saves answers and language from plain payload object', () => {
    const ss = new MockSpreadsheet() as any;
    const service = new WebFormService(ss);

    // Arrange dashboard + config sheet
    const dashboard = ss.getSheetByName('Forms Dashboard');
    dashboard.setMockData([
      [], [], [],
      ['Test Form', 'Config: Test', 'Test Responses', 'Desc', '', '', '', '']
    ]);

    const config = ss.insertSheet('Config: Test');
    // Headers
    config.setMockData([
      ['ID', 'Type', 'Question (EN)', 'Question (FR)', 'Question (NL)', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Status'],
      ['Q1', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active'],
      ['Q2', 'CHOICE', 'Color', 'Couleur', 'Kleur', false, 'Red,Blue', 'Rouge,Bleu', 'Rood,Blauw', 'Active']
    ]);

    // Act
    const payload = {
      formKey: 'Config: Test',
      language: 'FR',
      Q1: 'Alice',
      Q2: 'Blue'
    };
    const result = service.submitWebForm(payload);

    // Assert
    expect(result.success).toBe(true);
    const sheet = ss.getSheetByName('Test Responses');
    const rows = sheet?.getValues() || [];
    // Row 0 headers, Row 1 data (Language now first column; Created At is meta)
    expect(rows[1][0]).toBe('FR');           // Language
    expect(rows[1][1]).toBe('Alice');        // Q1
    expect(rows[1][2]).toBe('Blue');         // Q2
    expect(rows[1][4]).toBeInstanceOf(Date); // Created At
  });

  test('new submissions set Updated At equal to Created At', () => {
    const ss = new MockSpreadsheet() as any;
    const service = new WebFormService(ss);
    const dashboard = ss.getSheetByName('Forms Dashboard');
    dashboard.setMockData([
      [], [], [],
      ['Meal Form', 'Config: Meals', 'Meals Data', 'Desc', '', '', '', '']
    ]);
    const config = ss.insertSheet('Config: Meals');
    config.setMockData([
      ['ID', 'Type', 'Question (EN)', 'Question (FR)', 'Question (NL)', 'Required?', 'Options (EN)', 'Options (FR)', 'Options (NL)', 'Status', 'Config'],
      ['Q1', 'TEXT', 'Meal', 'Repas', 'Maaltijd', true, '', '', '', 'Active', '']
    ]);

    service.submitWebForm({ formKey: 'Config: Meals', language: 'EN', Q1: 'Lunch' });

    const sheet = ss.getSheetByName('Meals Data');
    const rows = sheet?.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues() || [];
    const header = rows[0];
    const createdIdx = header.findIndex((col: string) => col === 'Created At');
    const updatedIdx = header.findIndex((col: string) => col === 'Updated At');
    expect(createdIdx).toBeGreaterThan(-1);
    expect(updatedIdx).toBeGreaterThan(-1);
    expect(rows[1][createdIdx]).toBeInstanceOf(Date);
    expect(rows[1][updatedIdx]).toEqual(rows[1][createdIdx]);
  });
});
