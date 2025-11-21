# Google Apps Script Setup Instructions (TypeScript)

This project uses TypeScript. You need to build the script before using it in Google Sheets.

## 1. Prerequisites
- Node.js installed on your machine.

## 2. Build the Script
1. Open a terminal in this directory.
2. Run `npm install` to install dependencies.
3. Run `npm test` to run unit tests (Optional).
4. Run `npm run build` to compile the TypeScript code.
   - This will generate a `dist/Code.js` file.

## 3. Create a Google Sheet
1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it "Community Kitchen Logs".

## 4. Add the Script
1. In the spreadsheet, go to **Extensions** > **Apps Script**.
2. Delete any code in the `Code.gs` file.
3. Copy the content of `dist/Code.js` (generated in step 2) and paste it into the editor.
4. Click the **Save** icon.
5. Name the project "Form Generator".

## 5. Run Setup
1. Refresh your Google Sheet tab.
2. Click **Community Kitchen** > **1. Setup Dashboard**.
3. Authorize the script when prompted.
4. This will create a "Forms Dashboard" and example config sheets.

## 6. Configure Your Forms
1. **Dashboard**: Add new rows to the "Forms Dashboard" sheet for each form.
   - **Form Title**: The title users will see.
   - **Configuration Sheet Name**: e.g., "Config: Fridge".
   - **Destination Tab Name**: Name for the sheet where responses will go (e.g., "Fridge Logs").
   - **Description**: Form description.
   - **Form ID / URLs**: Leave these blank. The script will fill them in.
2. **Config Sheets**: Create new sheets (tabs) for each form.
   - Copy the header row from an example sheet.
   - **Status**: Set to "Active" to include in the form, or "Archived" to remove it (keeping data).

## 7. Generate All Forms
1. Click **Community Kitchen** > **2. Generate All Forms**.
2. The script will:
   - Create new forms if they don't exist.
   - Update existing forms if they do (based on Form ID).
   - Rename the response tab for new forms.
   - Populate the Dashboard with Edit/Published URLs.
