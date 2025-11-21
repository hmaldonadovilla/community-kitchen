# Community Kitchen Form Generator

A Google Apps Script project to digitize AFSCA compliance documentation for a community kitchen in Brussels.

## Features

- **Multi-language Support**: Generates forms with branching logic for English, French, and Dutch.
- **Dashboard Management**: Manage multiple forms from a single "Forms Dashboard" sheet.
- **Smart Updates**: Updates existing forms without breaking links or losing data.
- **Archiving**: Soft-delete questions by marking them as "Archived" in the config sheet.
- **Destination Management**: Automatically renames response tabs for better organization.

## Architecture

The project is refactored into modular components:

- **`src/index.ts`**: Entry point for Apps Script triggers and menu items.
- **`src/config/Dashboard.ts`**: Handles reading and writing to the central dashboard.
- **`src/config/ConfigSheet.ts`**: Parses individual form configuration sheets.
- **`src/services/FormGenerator.ts`**: Orchestrates the generation process.
- **`src/services/FormBuilder.ts`**: Handles the low-level Google Form manipulation.

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Build**:
   ```bash
   npm run build
   ```
   This generates `dist/Code.js`.

3. **Deploy**:
   - Create a new Google Sheet.
   - Open **Extensions > Apps Script**.
   - Paste the content of `dist/Code.js`.
   - Run `setup()` to initialize the dashboard.

## Testing

Run unit tests with:
```bash
npm test
```
