import { QuestionConfig, TemplateIdBase, TemplateIdMap } from '../../../types';
import { escapeRegExp, resolveLocalizedValue, slugifyPlaceholder } from './utils';

type KeyRewrite = { from: string; to: string; reason: string };

const collectTemplateIdsFromBase = (base: TemplateIdBase | undefined): string[] => {
  if (!base) return [];
  if (typeof base === 'string') return [base];
  if (base && typeof base === 'object') return Object.values(base).filter(Boolean);
  return [];
};

export const collectTemplateIdsFromMap = (map: TemplateIdMap | undefined): string[] => {
  if (!map) return [];
  if (typeof map === 'string' || (map && typeof map === 'object' && !(map as any).cases)) {
    return collectTemplateIdsFromBase(map as any);
  }
  const out: string[] = [];
  const cases = Array.isArray((map as any).cases) ? ((map as any).cases as any[]) : [];
  cases.forEach(c => {
    out.push(...collectTemplateIdsFromBase(c?.templateId));
  });
  out.push(...collectTemplateIdsFromBase((map as any).default));
  return out.filter(Boolean);
};

const dedupe = <T>(items: T[]): T[] => Array.from(new Set(items));

const buildKeyRewrites = (questions: QuestionConfig[]): { rewrites: KeyRewrite[]; warnings: string[] } => {
  const rewrites: KeyRewrite[] = [];
  const warnings: string[] = [];

  const questionIds = new Set(
    questions
      .filter(q => q && q.type !== 'BUTTON')
      .map(q => (q.id || '').toString().trim())
      .filter(Boolean)
  );

  // 1) Question label-slug placeholders: {{LABEL_SLUG}} -> {{ID}}
  const slugToIds: Record<string, string[]> = {};
  questions
    .filter(q => q && q.type !== 'BUTTON')
    .forEach(q => {
      const id = (q.id || '').toString().trim();
      if (!id) return;
      const slug = slugifyPlaceholder((q.qEn || q.id || '').toString());
      if (!slug) return;
      slugToIds[slug] = slugToIds[slug] || [];
      slugToIds[slug].push(id);
    });

  Object.entries(slugToIds).forEach(([slug, ids]) => {
    const uniqueIds = dedupe(ids);
    if (uniqueIds.length !== 1) {
      warnings.push(
        `Ambiguous question label slug "${slug}" maps to multiple IDs (${uniqueIds.join(', ')}). Skipping migration for this slug.`
      );
      return;
    }
    const id = uniqueIds[0];
    if (slug === id) return;
    if (questionIds.has(slug) && slug !== id) {
      warnings.push(
        `Question label slug "${slug}" is also a real question ID (conflicts with ${id}). Skipping migration for this slug.`
      );
      return;
    }
    rewrites.push({ from: slug, to: id, reason: 'question.labelSlug->id' });
  });

  // 2) Line item field label-slug placeholders: {{GROUP.FIELD_SLUG}} -> {{GROUP.FIELD_ID}}
  questions
    .filter(q => q && q.type === 'LINE_ITEM_GROUP')
    .forEach(q => {
      const groupId = (q.id || '').toString().trim();
      const cfg: any = (q as any).lineItemConfig;
      const fields: any[] = Array.isArray(cfg?.fields) ? cfg.fields : [];
      const subGroups: any[] = Array.isArray(cfg?.subGroups) ? cfg.subGroups : [];

      fields.forEach(field => {
        const fid = (field?.id || '').toString().trim();
        if (!fid) return;
        const slug = slugifyPlaceholder((field?.labelEn || fid).toString());
        if (!slug || slug === fid) return;
        rewrites.push({
          from: `${groupId}.${slug}`,
          to: `${groupId}.${fid}`,
          reason: 'lineItemField.labelSlug->id'
        });
      });

      // 3) Subgroup key + subgroup field label-slug placeholders
      subGroups.forEach(sub => {
        const subId = (sub?.id || '').toString().trim();
        if (!subId) {
          warnings.push(`LINE_ITEM_GROUP "${groupId}" has a subGroup without id. Cannot migrate subgroup placeholders safely.`);
          return;
        }

        const legacyKey = resolveLocalizedValue(sub?.label, '').toString().trim();
        const legacySlug = legacyKey ? slugifyPlaceholder(legacyKey) : '';

        // COUNT/CONSOLIDATED directives sometimes reference GROUP.SUBGROUP (no field)
        if (legacyKey && legacyKey !== subId) {
          rewrites.push({ from: `${groupId}.${legacyKey}`, to: `${groupId}.${subId}`, reason: 'subGroup.labelKey->id' });
        }
        if (legacySlug && legacySlug !== subId) {
          rewrites.push({ from: `${groupId}.${legacySlug}`, to: `${groupId}.${subId}`, reason: 'subGroup.labelSlug->id' });
        }

        const subFields: any[] = Array.isArray(sub?.fields) ? sub.fields : [];
        subFields.forEach(field => {
          const fid = (field?.id || '').toString().trim();
          if (!fid) return;
          const fSlug = slugifyPlaceholder((field?.labelEn || fid).toString());

          // subgroup field slug -> id (subgroup id already canonical)
          if (fSlug && fSlug !== fid) {
            rewrites.push({
              from: `${groupId}.${subId}.${fSlug}`,
              to: `${groupId}.${subId}.${fid}`,
              reason: 'subGroupField.labelSlug->id'
            });
          }

          // legacy subgroup key (label-based) -> id
          if (legacyKey && legacyKey !== subId) {
            rewrites.push({
              from: `${groupId}.${legacyKey}.${fid}`,
              to: `${groupId}.${subId}.${fid}`,
              reason: 'subGroupField.legacyKeyFieldId->id'
            });
            if (fSlug && fSlug !== fid) {
              rewrites.push({
                from: `${groupId}.${legacyKey}.${fSlug}`,
                to: `${groupId}.${subId}.${fid}`,
                reason: 'subGroupField.legacyKeyFieldSlug->id'
              });
            }
          }
          if (legacySlug && legacySlug !== subId) {
            rewrites.push({
              from: `${groupId}.${legacySlug}.${fid}`,
              to: `${groupId}.${subId}.${fid}`,
              reason: 'subGroupField.legacySlugFieldId->id'
            });
            if (fSlug && fSlug !== fid) {
              rewrites.push({
                from: `${groupId}.${legacySlug}.${fSlug}`,
                to: `${groupId}.${subId}.${fid}`,
                reason: 'subGroupField.legacySlugFieldSlug->id'
              });
            }
          }
        });
      });
    });

  // De-dupe rewrites (keep first reason).
  const seen = new Set<string>();
  const deduped: KeyRewrite[] = [];
  rewrites.forEach(r => {
    const key = `${r.from}=>${r.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(r);
  });

  return { rewrites: deduped, warnings };
};

const expandToTokenRewrites = (fromKey: string, toKey: string): Array<{ pattern: string; replacement: string }> => {
  const wrappers = [
    (k: string) => `{{${k}}}`,
    (k: string) => `{{CONSOLIDATED(${k})}}`,
    (k: string) => `{{SUM(${k})}}`,
    (k: string) => `{{COUNT(${k})}}`,
    (k: string) => `{{CONSOLIDATED_ROW(${k})}}`,
    (k: string) => `{{ALWAYS_SHOW(${k})}}`,
    (k: string) => `{{ALWAYS_SHOW(CONSOLIDATED_ROW(${k}))}}`
  ];
  return wrappers.map(makeToken => {
    const fromToken = makeToken(fromKey);
    const toToken = makeToken(toKey);
    return {
      pattern: `(?i)${escapeRegExp(fromToken)}`,
      replacement: toToken
    };
  });
};

export const migrateDocTemplatePlaceholdersToIds = (args: {
  templateId: string;
  questions: QuestionConfig[];
}): { success: boolean; message?: string; warnings?: string[]; templateId: string } => {
  const templateId = (args.templateId || '').toString().trim();
  if (!templateId) return { success: false, message: 'templateId is required.', templateId: '' };

  const { rewrites, warnings } = buildKeyRewrites(args.questions);
  if (!rewrites.length) {
    return { success: true, message: 'No legacy label-based placeholders detected for migration.', warnings, templateId };
  }

  try {
    const doc = DocumentApp.openById(templateId);
    const body = doc.getBody();
    const header = doc.getHeader();
    const footer = doc.getFooter();
    const targets: any[] = [body];
    if (header) targets.push(header as any);
    if (footer) targets.push(footer as any);

    const tokenRewrites = dedupe(
      rewrites.flatMap(r => expandToTokenRewrites(r.from, r.to)).map(tr => JSON.stringify(tr))
    ).map(s => JSON.parse(s) as { pattern: string; replacement: string });

    tokenRewrites.forEach(tr => {
      targets.forEach(t => {
        try {
          if (t && typeof t.replaceText === 'function') {
            t.replaceText(tr.pattern, tr.replacement);
          } else if (t && typeof t.editAsText === 'function') {
            t.editAsText().replaceText(tr.pattern, tr.replacement);
          }
        } catch (_) {
          // ignore best-effort replacement errors in non-text containers
        }
      });
    });

    doc.saveAndClose();
    const msg = `Template migration complete. Applied ${tokenRewrites.length} token rewrite patterns across body/header/footer.`;
    return { success: true, message: msg, warnings, templateId };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to migrate template placeholders: ${err?.message || err?.toString?.() || 'unknown'}`,
      warnings,
      templateId
    };
  }
};


