/**
 * Owns pure template id collection for Cloud Run template operations.
 */
const toText = value => (value === undefined || value === null ? '' : value.toString().trim());

const collectTemplateIdsFromBase = base => {
  if (!base) return [];
  if (typeof base === 'string') return [base];
  if (typeof base === 'object') return Object.values(base).filter(Boolean);
  return [];
};

const collectTemplateIdsFromMap = map => {
  if (!map) return [];
  if (typeof map === 'string' || (typeof map === 'object' && !Array.isArray(map.cases))) {
    return collectTemplateIdsFromBase(map);
  }
  const out = [];
  (Array.isArray(map.cases) ? map.cases : []).forEach(entry => {
    out.push(...collectTemplateIdsFromBase(entry && entry.templateId));
  });
  out.push(...collectTemplateIdsFromBase(map.default));
  return Array.from(new Set(out.map(toText).map(item => item.trim()).filter(Boolean)));
};

const isBundledHtmlPdfTemplate = templateId => {
  const normalized = toText(templateId).toLowerCase();
  return normalized.startsWith('bundle:') && normalized.endsWith('.pdf.html');
};

const collectTemplatePrefetchIds = (form, questions) => {
  const safeForm = form || {};
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const htmlIds = [];
  const markdownIds = [];
  const docIds = [];
  if (safeForm.summaryHtmlTemplateId) htmlIds.push(...collectTemplateIdsFromMap(safeForm.summaryHtmlTemplateId));
  if (safeForm.followupConfig && safeForm.followupConfig.pdfTemplateId) {
    collectTemplateIdsFromMap(safeForm.followupConfig.pdfTemplateId).forEach(id => {
      if (isBundledHtmlPdfTemplate(id)) htmlIds.push(id);
      else docIds.push(id);
    });
  }
  if (safeForm.followupConfig && safeForm.followupConfig.emailTemplateId) {
    docIds.push(...collectTemplateIdsFromMap(safeForm.followupConfig.emailTemplateId));
  }
  safeQuestions
    .filter(question => question && question.type === 'BUTTON' && question.button && question.button.templateId)
    .forEach(question => {
      if (question.button.action === 'renderMarkdownTemplate') markdownIds.push(...collectTemplateIdsFromMap(question.button.templateId));
      if (question.button.action === 'renderHtmlTemplate') htmlIds.push(...collectTemplateIdsFromMap(question.button.templateId));
      if (question.button.action === 'renderDocTemplate') docIds.push(...collectTemplateIdsFromMap(question.button.templateId));
    });
  return {
    htmlIds: Array.from(new Set(htmlIds.map(toText).filter(Boolean))),
    markdownIds: Array.from(new Set(markdownIds.map(toText).filter(Boolean))),
    docIds: Array.from(new Set(docIds.map(toText).filter(Boolean)))
  };
};

module.exports = {
  collectTemplateIdsFromMap,
  collectTemplatePrefetchIds,
  isBundledHtmlPdfTemplate
};
