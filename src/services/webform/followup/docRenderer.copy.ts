import { FollowupConfig, FormConfig, QuestionConfig, TemplateIdMap, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { debugLog } from '../debug';
import { addPlaceholderVariants, applyPlaceholders, escapeRegExp } from './utils';
import { addConsolidatedPlaceholders, buildPlaceholderMap, collectLineItemRows } from './placeholders';
import { collectValidationWarnings } from './validation';
import { resolveTemplateId } from './recipients';
import { renderLineItemTables } from './tableRendering';
import { linkifyUploadedFileUrls } from './fileLinks';

/**
 * Core renderer: copy a Doc template, apply placeholders and directives, return the Drive file.
 *
 * Responsibility:
 * - Resolve template id (including TemplateIdMap)
 * - Copy the template
 * - Render line-item tables + placeholder replacements
 * - Linkify FILE_UPLOAD URLs
 */

export const renderDocCopyFromTemplate = (args: {
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  namePrefix?: string;
  copyFolder: GoogleAppsScript.Drive.Folder;
}): { success: boolean; message?: string; copy?: GoogleAppsScript.Drive.File; copyName?: string } => {
  const { dataSources, form, questions, record, templateIdMap, namePrefix, copyFolder } = args;
  const templateId = resolveTemplateId(templateIdMap, record);
  if (!templateId) {
    return { success: false, message: 'No template matched the record values/language.' };
  }
  try {
    const templateFile = DriveApp.getFileById(templateId);
    const copyName = `${namePrefix || form.title || 'Form'} - ${record.id || generateUuid()}`;
    const copy = templateFile.makeCopy(copyName, copyFolder);
    const doc = DocumentApp.openById(copy.getId());
    const lineItemRows = collectLineItemRows(record, questions);
    const placeholders = buildPlaceholderMap({ record, questions, lineItemRows, dataSources });
    addConsolidatedPlaceholders(placeholders, questions, lineItemRows);
    const validationWarnings = collectValidationWarnings(questions, record);
    addPlaceholderVariants(placeholders, 'VALIDATION_WARNINGS', validationWarnings.join('\n'));
    renderLineItemTables(doc, questions, lineItemRows);
    const body = doc.getBody();
    const header = doc.getHeader();
    const footer = doc.getFooter();
    const targets: any[] = [body];
    if (header) targets.push(header as any);
    if (footer) targets.push(footer as any);

    // Apply DEFAULT() placeholders first so fallbacks can still include normal tokens.
    // Example: {{DEFAULT(COOK, "Unknown")}} or {{DEFAULT({{COOK}}, "Unknown")}}
    try {
      const DEFAULT_RE = /{{\s*DEFAULT\s*\(\s*[\s\S]*?\s*\)\s*}}/gi;
      targets.forEach(t => {
        let text = '';
        try {
          text = t && typeof t.getText === 'function' ? (t.getText() || '').toString() : '';
        } catch (_) {
          text = '';
        }
        if (!text || !text.includes('DEFAULT')) return;
        const matches = text.match(DEFAULT_RE) || [];
        const unique = Array.from(new Set(matches.map(m => (m || '').toString()).filter(Boolean)));
        unique.forEach(token => {
          const replacement = applyPlaceholders(token, placeholders);
          const pattern = escapeRegExp(token);
          try {
            if (t && typeof t.replaceText === 'function') {
              t.replaceText(pattern, replacement ?? '');
            } else if (t && typeof t.editAsText === 'function') {
              t.editAsText().replaceText(pattern, replacement ?? '');
            }
          } catch (_) {
            // best effort
          }
        });
      });
    } catch (_) {
      // best effort; don't fail rendering due to DEFAULT placeholder processing
    }

    // Replace placeholders across the full document, including header/footer.
    Object.entries(placeholders).forEach(([token, value]) => {
      const pattern = escapeRegExp(token);
      targets.forEach(t => {
        try {
          if (t && typeof t.replaceText === 'function') {
            t.replaceText(pattern, value ?? '');
          } else if (t && typeof t.editAsText === 'function') {
            t.editAsText().replaceText(pattern, value ?? '');
          }
        } catch (_) {
          // ignore best-effort replacement errors in non-text containers
        }
      });
    });

    linkifyUploadedFileUrls(doc, questions, record);

    doc.saveAndClose();
    return { success: true, copy, copyName };
  } catch (err) {
    debugLog('followup.renderDocCopy.failed', { error: err ? err.toString() : 'unknown' });
    return { success: false, message: 'Failed to render template.' };
  }
};

export const resolveOutputFolder = (
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  folderId: string | undefined,
  followup: FollowupConfig | undefined
): GoogleAppsScript.Drive.Folder => {
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (_) {
      // fall through to follow-up/default folder
    }
  }
  return resolveFollowupFolder(ss, followup || {});
};

const resolveFollowupFolder = (
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  followup: FollowupConfig
): GoogleAppsScript.Drive.Folder => {
  if (followup.pdfFolderId) {
    try {
      return DriveApp.getFolderById(followup.pdfFolderId);
    } catch (_) {
      // fall through to default
    }
  }
  try {
    const file = DriveApp.getFileById(ss.getId());
    const parents = file.getParents();
    if (parents && parents.hasNext()) {
      return parents.next();
    }
  } catch (_) {
    // ignore
  }
  return DriveApp.getRootFolder();
};

const generateUuid = (): string => {
  try {
    if (typeof Utilities !== 'undefined' && (Utilities as any).getUuid) {
      return (Utilities as any).getUuid();
    }
  } catch (_) {
    // ignore
  }
  return 'uuid-' + Math.random().toString(16).slice(2);
};


