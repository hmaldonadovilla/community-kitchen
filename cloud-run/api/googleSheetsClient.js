const { createGoogleApiClient } = require('./googleApiClient');

const SHEETS_API_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

const escapeSheetName = name => `'${(name || '').toString().replace(/'/g, "''")}'`;

const columnName = index => {
  let n = Math.max(1, Math.floor(Number(index) || 1));
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const createGoogleSheetsClient = (deps = {}) => {
  const googleApiClient = deps.googleApiClient || createGoogleApiClient(deps);

  const getSheetProperties = async (spreadsheetId, sheetName) => {
    const id = (spreadsheetId || '').toString().trim();
    const tab = (sheetName || '').toString().trim();
    if (!id) throw new Error('Google Sheets spreadsheet id is required.');
    if (!tab) throw new Error('Google Sheets tab name is required.');
    const fields = encodeURIComponent('sheets(properties(sheetId,title))');
    const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}?fields=${fields}`;
    const payload = await googleApiClient.request(url);
    const sheet = (Array.isArray(payload.sheets) ? payload.sheets : []).find(entry => {
      const title = entry && entry.properties && entry.properties.title;
      return (title || '').toString() === tab;
    });
    if (!sheet || !sheet.properties || sheet.properties.sheetId === undefined) {
      throw new Error(`Google Sheets tab not found: ${tab}`);
    }
    return sheet.properties;
  };

  return {
    async createSpreadsheet(title, options = {}) {
      const name = (title || '').toString().trim() || 'Spreadsheet';
      const sheetName = (options.sheetName || 'Report').toString().trim() || 'Report';
      const url = SHEETS_API_BASE_URL;
      return googleApiClient.request(url, {
        method: 'POST',
        body: {
          properties: { title: name },
          sheets: [
            {
              properties: {
                title: sheetName.slice(0, 99)
              }
            }
          ]
        }
      });
    },

    async getSheetValues(spreadsheetId, sheetName) {
      const id = (spreadsheetId || '').toString().trim();
      const tab = (sheetName || '').toString().trim();
      if (!id) throw new Error('Google Sheets spreadsheet id is required.');
      if (!tab) throw new Error('Google Sheets tab name is required.');
      const range = encodeURIComponent(escapeSheetName(tab));
      const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}/values/${range}?majorDimension=ROWS`;
      const payload = await googleApiClient.request(url);
      return Array.isArray(payload.values) ? payload.values : [];
    },
    async updateValuesRange(spreadsheetId, rangeA1, rows, options = {}) {
      const id = (spreadsheetId || '').toString().trim();
      const rangeText = (rangeA1 || '').toString().trim();
      const values = (Array.isArray(rows) ? rows : []).filter(row => Array.isArray(row));
      if (!id) throw new Error('Google Sheets spreadsheet id is required.');
      if (!rangeText) throw new Error('Google Sheets range is required.');
      if (!values.length) return { updatedRows: 0 };
      const valueInputOption = (options.valueInputOption || 'USER_ENTERED').toString().trim() || 'USER_ENTERED';
      const range = encodeURIComponent(rangeText);
      const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}/values/${range}?valueInputOption=${encodeURIComponent(valueInputOption)}`;
      return googleApiClient.request(url, {
        method: 'PUT',
        body: {
          range: rangeText,
          majorDimension: 'ROWS',
          values
        }
      });
    },
    async updateRowValues(spreadsheetId, sheetName, rowNumber, values) {
      const id = (spreadsheetId || '').toString().trim();
      const tab = (sheetName || '').toString().trim();
      const row = Math.max(1, Math.floor(Number(rowNumber) || 1));
      const width = Math.max(1, Array.isArray(values) ? values.length : 1);
      if (!id) throw new Error('Google Sheets spreadsheet id is required.');
      if (!tab) throw new Error('Google Sheets tab name is required.');
      const rangeA1 = `${escapeSheetName(tab)}!A${row}:${columnName(width)}${row}`;
      const range = encodeURIComponent(rangeA1);
      const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}/values/${range}?valueInputOption=USER_ENTERED`;
      return googleApiClient.request(url, {
        method: 'PUT',
        body: {
          range: rangeA1,
          majorDimension: 'ROWS',
          values: [Array.isArray(values) ? values : [values]]
        }
      });
    },
    async appendRows(spreadsheetId, sheetName, rows) {
      const id = (spreadsheetId || '').toString().trim();
      const tab = (sheetName || '').toString().trim();
      const values = (Array.isArray(rows) ? rows : []).filter(row => Array.isArray(row));
      if (!id) throw new Error('Google Sheets spreadsheet id is required.');
      if (!tab) throw new Error('Google Sheets tab name is required.');
      if (!values.length) return { updates: { updatedRows: 0 } };
      const rangeA1 = escapeSheetName(tab);
      const range = encodeURIComponent(rangeA1);
      const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      return googleApiClient.request(url, {
        method: 'POST',
        body: {
          range: rangeA1,
          majorDimension: 'ROWS',
          values
        }
      });
    },
    async addSheet(spreadsheetId, sheetName, options = {}) {
      const id = (spreadsheetId || '').toString().trim();
      const tab = (sheetName || '').toString().trim();
      if (!id) throw new Error('Google Sheets spreadsheet id is required.');
      if (!tab) throw new Error('Google Sheets tab name is required.');
      const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}:batchUpdate`;
      return googleApiClient.request(url, {
        method: 'POST',
        body: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: tab,
                  hidden: options.hidden === true
                }
              }
            }
          ]
        }
      });
    },
    async deleteRow(spreadsheetId, sheetName, rowNumber) {
      const id = (spreadsheetId || '').toString().trim();
      const row = Math.max(1, Math.floor(Number(rowNumber) || 1));
      if (!id) throw new Error('Google Sheets spreadsheet id is required.');
      const properties = await getSheetProperties(spreadsheetId, sheetName);
      const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}:batchUpdate`;
      return googleApiClient.request(url, {
        method: 'POST',
        body: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: properties.sheetId,
                  dimension: 'ROWS',
                  startIndex: row - 1,
                  endIndex: row
                }
              }
            }
          ]
        }
      });
    },
    async batchUpdate(spreadsheetId, requests) {
      const id = (spreadsheetId || '').toString().trim();
      if (!id) throw new Error('Google Sheets spreadsheet id is required.');
      const requestList = Array.isArray(requests) ? requests.filter(Boolean) : [];
      if (!requestList.length) return { replies: [] };
      const url = `${SHEETS_API_BASE_URL}/${encodeURIComponent(id)}:batchUpdate`;
      return googleApiClient.request(url, {
        method: 'POST',
        body: { requests: requestList }
      });
    }
  };
};

module.exports = {
  columnName,
  createGoogleSheetsClient,
  escapeSheetName
};
