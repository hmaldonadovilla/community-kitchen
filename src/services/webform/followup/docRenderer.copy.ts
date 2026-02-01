import { FollowupConfig, FormConfig, QuestionConfig, TemplateIdMap, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { debugLog } from '../debug';
import {
  copyDriveApiFile,
  createDriveApiFile,
  exportDriveApiFile,
  getDriveApiFile,
  readDriveFileAsString,
  resolveDriveApiFolderTarget,
  trashDriveApiFile
} from '../driveApi';
import { addPlaceholderVariants, applyPlaceholders, escapeRegExp } from './utils';
import { addConsolidatedPlaceholders, addLabelPlaceholders, buildPlaceholderMap, collectLineItemRows } from './placeholders';
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

const META_FILE_NAME_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);

const sanitizeFileLabel = (value: string): string => {
  return (value || '')
    .toString()
    .replace(/[\\\/]+/g, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeFileLabel = (value: any): string => {
  if (value === undefined || value === null) return '';
  const text = sanitizeFileLabel(value.toString());
  const lowered = text.toLowerCase();
  if (!text || lowered === 'null' || lowered === 'undefined') return '';
  return text;
};

const resolveMetaFileLabel = (record: WebFormSubmission, fieldId: string): string => {
  const key = fieldId.toLowerCase();
  if (key === 'id') return normalizeFileLabel(record.id);
  if (key === 'createdat') return normalizeFileLabel(record.createdAt);
  if (key === 'updatedat') return normalizeFileLabel(record.updatedAt);
  if (key === 'status') return normalizeFileLabel(record.status);
  if (key === 'pdfurl') return normalizeFileLabel(record.pdfUrl);
  return '';
};

export const resolveRecordFileLabel = (form: FormConfig, record: WebFormSubmission): string => {
  const fieldIdRaw = form.followupConfig?.pdfFileNameFieldId;
  const fieldId = fieldIdRaw ? fieldIdRaw.toString().trim() : '';
  if (fieldId) {
    if (META_FILE_NAME_FIELDS.has(fieldId) || META_FILE_NAME_FIELDS.has(fieldId.toLowerCase())) {
      const metaLabel = resolveMetaFileLabel(record, fieldId);
      if (metaLabel) return metaLabel;
    }
    const value = (record?.values as any)?.[fieldId];
    const label = normalizeFileLabel(value);
    if (label) return label;
  }
  const recordId = normalizeFileLabel(record.id);
  return recordId;
};

export const renderDocCopyFromTemplate = (args: {
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  namePrefix?: string;
  outputTarget: OutputTarget;
}): { success: boolean; message?: string; copyId?: string; copyName?: string; resolvedBy?: 'DriveApp' | 'DriveAPI' } => {
  const { dataSources, form, questions, record, templateIdMap, namePrefix, outputTarget } = args;
  const templateId = resolveTemplateId(templateIdMap, record);
  if (!templateId) {
    return { success: false, message: 'No template matched the record values/language.' };
  }
  try {
    const recordLabel = resolveRecordFileLabel(form, record);
    const copyName = `${namePrefix || form.title || 'Form'} - ${recordLabel || generateUuid()}`;
    const copyInfo = copyTemplateToFolder(templateId, copyName, outputTarget);
    if (!copyInfo || !copyInfo.fileId) {
      return { success: false, message: 'Failed to copy template.' };
    }
    const doc = DocumentApp.openById(copyInfo.fileId);
    const lineItemRows = collectLineItemRows(record, questions);
    const placeholders = buildPlaceholderMap({ record, questions, lineItemRows, dataSources });
    addLabelPlaceholders(placeholders, questions, record.language);
    addConsolidatedPlaceholders(placeholders, questions, lineItemRows);
    const validationWarnings = collectValidationWarnings(questions, record);
    addPlaceholderVariants(placeholders, 'VALIDATION_WARNINGS', validationWarnings.join('\n'));
    renderLineItemTables(doc, questions, lineItemRows, { dataSources, language: record.language });
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
    return { success: true, copyId: copyInfo.fileId, copyName, resolvedBy: copyInfo.resolvedBy };
  } catch (err) {
    debugLog('followup.renderDocCopy.failed', { error: err ? err.toString() : 'unknown' });
    return { success: false, message: 'Failed to render template.' };
  }
};

export type OutputTarget = {
  folderId: string;
  folderName?: string | null;
  resolvedBy: 'DriveApp' | 'DriveAPI';
  folder?: GoogleAppsScript.Drive.Folder;
  createFile: (blob: GoogleAppsScript.Base.Blob) => { fileId?: string; url?: string };
};

export const resolveOutputTarget = (
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  folderId: string | undefined,
  followup: FollowupConfig | undefined
): OutputTarget => {
  const explicitId = folderId ? folderId.toString().trim() : '';
  if (explicitId) {
    const target = resolveFolderTargetById(explicitId, 'followup.output.explicit');
    if (target) return target;
  }
  const followupId = followup?.pdfFolderId ? followup.pdfFolderId.toString().trim() : '';
  if (followupId) {
    const target = resolveFolderTargetById(followupId, 'followup.output.config');
    if (target) return target;
  }
  try {
    const file = DriveApp.getFileById(ss.getId());
    const parents = file.getParents();
    if (parents && parents.hasNext()) {
      const folder = parents.next();
      return makeDriveAppTarget(folder);
    }
  } catch (_) {
    // DriveApp can fail on shared drives; fallback to Drive API
  }
  const meta = resolveDriveApiFolderTargetBySpreadsheet(ss);
  if (meta) return makeDriveApiTarget(meta.folderId, meta.folderName || null);
  throw new Error('Unable to resolve output folder. No parent folder was returned for the spreadsheet.');
};

export const resolveRootOutputTarget = (): OutputTarget => {
  const folder = DriveApp.getRootFolder();
  return makeDriveAppTarget(folder);
};

export const exportPdfBlobFromDoc = (fileId: string): GoogleAppsScript.Base.Blob => {
  const id = (fileId || '').toString().trim();
  if (!id) throw new Error('Missing file id.');
  try {
    return DriveApp.getFileById(id).getAs('application/pdf');
  } catch (_) {
    const blob = exportDriveApiFile(id, 'application/pdf');
    if (!blob) throw new Error('Failed to export PDF.');
    return blob;
  }
};

export const trashFileById = (fileId: string): boolean => {
  const id = (fileId || '').toString().trim();
  if (!id) return false;
  try {
    DriveApp.getFileById(id).setTrashed(true);
    return true;
  } catch (_) {
    return trashDriveApiFile(id);
  }
};

export const readDriveTemplateRawWithFallback = (
  templateId: string,
  preferredExportMimeTypes: string[],
  context?: string
): { raw: string; mimeType?: string } | null => {
  const id = (templateId || '').toString().trim();
  if (!id) return null;
  try {
    const file = DriveApp.getFileById(id);
    const mimeType = (file.getMimeType ? file.getMimeType() : '').toString();
    let raw = '';
    try {
      raw = file.getBlob().getDataAsString();
    } catch (_) {
      // ignore; try other exports
    }
    if (!raw && mimeType === 'application/vnd.google-apps.document') {
      for (const exportType of preferredExportMimeTypes) {
        try {
          raw = file.getAs(exportType).getDataAsString();
        } catch (_) {
          // ignore
        }
        if (raw) break;
      }
    }
    if (raw && raw.trim()) return { raw, mimeType };
  } catch (_) {
    // fallback to Drive API below
  }
  const fallback = readDriveFileAsString(id, preferredExportMimeTypes, context || 'template.read');
  return fallback || null;
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

const resolveFolderTargetById = (folderId: string, context: string): OutputTarget | null => {
  const id = (folderId || '').toString().trim();
  if (!id) return null;
  try {
    const folder = DriveApp.getFolderById(id);
    return makeDriveAppTarget(folder);
  } catch (_) {
    const apiTarget = resolveDriveApiFolderTarget(id, context);
    if (apiTarget) return makeDriveApiTarget(apiTarget.folderId, apiTarget.folderName || null);
  }
  return null;
};

const resolveDriveApiFolderTargetBySpreadsheet = (
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet
): { folderId: string; folderName?: string | null } | null => {
  const meta = resolveDriveApiFolderTargetForFile(ss.getId());
  return meta ? { folderId: meta.folderId, folderName: meta.folderName } : null;
};

const resolveDriveApiFolderTargetForFile = (
  fileId: string
): { folderId: string; folderName?: string | null } | null => {
  const fileMeta = getDriveApiFile(fileId, 'followup.output.spreadsheet');
  const parentId = fileMeta?.parents && fileMeta.parents.length ? fileMeta.parents[0].id : null;
  if (!parentId) return null;
  const parentMeta = resolveDriveApiFolderTarget(parentId, 'followup.output.parent');
  return parentMeta ? { folderId: parentMeta.folderId, folderName: parentMeta.folderName || null } : null;
};

const makeDriveAppTarget = (folder: GoogleAppsScript.Drive.Folder): OutputTarget => {
  return {
    folderId: folder.getId(),
    folderName: folder.getName(),
    resolvedBy: 'DriveApp',
    folder,
    createFile: blob => {
      const created = folder.createFile(blob);
      return { fileId: created.getId(), url: created.getUrl() };
    }
  };
};

const makeDriveApiTarget = (folderId: string, folderName: string | null): OutputTarget => {
  return {
    folderId,
    folderName,
    resolvedBy: 'DriveAPI',
    createFile: blob => {
      const created = createDriveApiFile(blob, folderId);
      if (!created) {
        throw new Error('Drive API createFile failed.');
      }
      const url = (created as any).webViewLink || (created as any).alternateLink || '';
      const fileId = created.id || '';
      return { fileId: fileId || undefined, url: url || (fileId ? `https://drive.google.com/open?id=${fileId}` : '') };
    }
  };
};

const copyTemplateToFolder = (
  templateId: string,
  copyName: string,
  outputTarget: OutputTarget
): { fileId?: string; resolvedBy?: 'DriveApp' | 'DriveAPI' } | null => {
  const id = (templateId || '').toString().trim();
  if (!id) return null;
  try {
    const templateFile = DriveApp.getFileById(id);
    const folder = outputTarget.folder || DriveApp.getFolderById(outputTarget.folderId);
    const copy = templateFile.makeCopy(copyName, folder);
    return { fileId: copy.getId(), resolvedBy: 'DriveApp' };
  } catch (_) {
    const apiCopy = copyDriveApiFile(id, copyName, outputTarget.folderId);
    if (apiCopy && apiCopy.id) return { fileId: apiCopy.id, resolvedBy: 'DriveAPI' };
  }
  return null;
};
