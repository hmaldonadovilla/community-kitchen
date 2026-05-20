import type { LangCode, WebFormDefinition } from '../../../types';

import type { TemplateRenderCacheOptions } from '../../api';

const normalizeText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

const resolveLanguageTemplateId = (template: any, language: LangCode): string => {
  if (!template) return '';
  if (typeof template === 'string') return normalizeText(template);
  if (typeof template !== 'object') return '';
  if (Array.isArray((template as any).cases)) return '';

  const langKey = normalizeText(language || 'EN').toUpperCase();
  const direct = normalizeText((template as any)[langKey]);
  if (direct) return direct;
  const lower = normalizeText(language || 'en').toLowerCase();
  const lowerPick = normalizeText((template as any)[lower]);
  if (lowerPick) return lowerPick;
  const enPick = normalizeText((template as any).EN);
  if (enPick) return enPick;
  const firstKey = Object.keys(template || {})[0];
  return firstKey ? normalizeText((template as any)[firstKey]) : '';
};

export type MarkdownTemplatePrefetchTarget = {
  buttonId: string;
  templateId: string;
  cacheOptions: TemplateRenderCacheOptions;
};

export const collectMarkdownTemplatePrefetchTargets = (
  definition: WebFormDefinition,
  language: LangCode
): MarkdownTemplatePrefetchTarget[] => {
  const targets: MarkdownTemplatePrefetchTarget[] = [];
  const seen = new Set<string>();

  (definition.questions || []).forEach(question => {
    if (!question || question.type !== 'BUTTON') return;
    const button = (question as any).button || {};
    if (normalizeText(button.action) !== 'renderMarkdownTemplate') return;

    const cacheScope = normalizeText(button.cacheScope ?? button.renderCacheScope ?? button.templateCacheScope) || 'record';
    if (cacheScope.toLowerCase() !== 'template') return;

    const templateId = resolveLanguageTemplateId(button.templateId, language);
    if (!templateId) return;

    const buttonId = normalizeText(question.id);
    if (!buttonId) return;

    const key = `${buttonId}::${templateId}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({
      buttonId,
      templateId,
      cacheOptions: {
        cacheScope: 'template',
        templateId
      }
    });
  });

  return targets;
};
