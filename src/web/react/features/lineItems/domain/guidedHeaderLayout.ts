type GuidedHeaderField = {
  id?: unknown;
  pair?: unknown;
  type?: unknown;
  ui?: { renderAsLabel?: boolean };
};

const fieldId = (field: GuidedHeaderField | null | undefined): string =>
  field?.id !== undefined && field?.id !== null ? field.id.toString() : '';

const uniqueFields = <T extends GuidedHeaderField>(fields: T[]): T[] => {
  const seen = new Set<string>();
  return fields.filter(field => {
    const id = fieldId(field);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const buildGuidedHeaderRows = <T extends GuidedHeaderField>(fields: T[]): T[][] => {
  if (!fields.length) return [];
  if (fields.length <= 3) {
    const unique = uniqueFields(fields);
    return unique.length ? [unique] : [];
  }

  const used = new Set<string>();
  const rows: T[][] = [];
  const isPairable = (field: T): boolean => {
    if (!field?.pair) return false;
    if ((field?.type || '').toString() === 'PARAGRAPH') return false;
    return true;
  };

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const id = fieldId(field);
    if (!id || used.has(id)) continue;

    const pairKey = field?.pair ? field.pair.toString() : '';
    if (pairKey && isPairable(field)) {
      const group: T[] = [field];
      for (let j = i + 1; j < fields.length; j += 1) {
        const candidate = fields[j];
        const candidateId = fieldId(candidate);
        if (!candidateId || used.has(candidateId)) continue;
        if ((candidate?.pair ? candidate.pair.toString() : '') === pairKey && isPairable(candidate)) {
          group.push(candidate);
        }
      }
      group.forEach(item => used.add(fieldId(item)));
      const maxPerRow = 3;
      for (let k = 0; k < group.length; k += maxPerRow) {
        rows.push(group.slice(k, k + maxPerRow));
      }
      continue;
    }

    let partner: T | null = null;
    for (let j = i + 1; j < fields.length; j += 1) {
      const candidate = fields[j];
      const candidateId = fieldId(candidate);
      if (!candidateId || used.has(candidateId)) continue;
      partner = candidate;
      break;
    }
    used.add(id);
    if (partner) {
      used.add(fieldId(partner));
      rows.push([field, partner]);
    } else {
      rows.push([field]);
    }
  }

  return rows;
};

export const resolveGuidedHeaderLayout = <T extends GuidedHeaderField>({
  guidedCollapsedFieldsInHeader,
  collapsedFieldsOrdered,
  fieldsToRender,
  showAnchorTitleAsHeaderTitle,
  anchorFieldId,
  showTitleControlInHeader,
  titleFieldId,
  guidedCompactHeaderSummaryFieldIdSet,
  collapsedFieldConfigs,
  guidedCompactHeaderSummaryText,
  hasExplicitRowHeaderSummary,
  isProgressive,
  rowCollapsed
}: {
  guidedCollapsedFieldsInHeader: boolean;
  collapsedFieldsOrdered: T[];
  fieldsToRender: T[];
  showAnchorTitleAsHeaderTitle: boolean;
  anchorFieldId: string;
  showTitleControlInHeader: boolean;
  titleFieldId: string;
  guidedCompactHeaderSummaryFieldIdSet: Set<string>;
  collapsedFieldConfigs: any[];
  guidedCompactHeaderSummaryText: string;
  hasExplicitRowHeaderSummary: boolean;
  isProgressive: boolean;
  rowCollapsed: boolean;
}): { headerFieldsToRender: T[]; bodyFieldsToRender: T[] } => {
  const headerCollapsedFieldsBase = guidedCollapsedFieldsInHeader
    ? ((collapsedFieldsOrdered.length ? collapsedFieldsOrdered : fieldsToRender) || []).filter(field => {
        const id = fieldId(field);
        if (!id) return false;
        if (showAnchorTitleAsHeaderTitle && id === anchorFieldId) return false;
        if (showTitleControlInHeader && id === titleFieldId) return false;
        if (guidedCompactHeaderSummaryFieldIdSet.has(id)) return false;
        return true;
      })
    : [];
  const guidedCollapsedFieldIdSet = new Set<string>(
    guidedCollapsedFieldsInHeader
      ? (collapsedFieldConfigs || [])
          .map((cfg: any) => (cfg?.fieldId ? cfg.fieldId.toString() : ''))
          .filter(Boolean)
      : []
  );
  const headerCollapsedFieldsToRender =
    guidedCollapsedFieldsInHeader && !guidedCompactHeaderSummaryText && !hasExplicitRowHeaderSummary
      ? headerCollapsedFieldsBase.slice(0, 3)
      : [];
  const headerCollapsedFieldIdSet = new Set<string>(
    headerCollapsedFieldsToRender
      .map(field => fieldId(field))
      .filter(Boolean)
  );
  const compactHeaderSummaryFieldIdSet = new Set<string>(
    !guidedCollapsedFieldsInHeader && isProgressive && rowCollapsed
      ? (collapsedFieldConfigs || [])
          .filter((cfg: any) => cfg && cfg.showLabel === false)
          .map((cfg: any) => (cfg?.fieldId ? cfg.fieldId.toString() : ''))
          .filter(Boolean)
      : []
  );
  const bodyFieldsToRenderBase =
    guidedCollapsedFieldsInHeader
      ? (fieldsToRender || []).filter(field => {
          const id = fieldId(field);
          if (headerCollapsedFieldIdSet.has(id)) return false;
          if (guidedCollapsedFieldIdSet.has(id)) return false;
          if (guidedCompactHeaderSummaryFieldIdSet.has(id)) return false;
          return true;
        })
      : !guidedCollapsedFieldsInHeader && isProgressive && rowCollapsed && compactHeaderSummaryFieldIdSet.size
        ? (fieldsToRender || []).filter(field => !compactHeaderSummaryFieldIdSet.has(fieldId(field)))
        : fieldsToRender;
  const canHoistSingleBodyFieldIntoHeader =
    guidedCollapsedFieldsInHeader &&
    isProgressive &&
    headerCollapsedFieldsToRender.length === 2 &&
    headerCollapsedFieldsToRender.every(field => field?.ui?.renderAsLabel === true) &&
    (bodyFieldsToRenderBase || []).length === 1 &&
    Boolean((bodyFieldsToRenderBase?.[0] as any)?.pair);
  const headerFieldsToRender = (() => {
    if (!canHoistSingleBodyFieldIntoHeader) return headerCollapsedFieldsToRender;
    const extra = (bodyFieldsToRenderBase?.[0] as T) || null;
    if (!extra) return headerCollapsedFieldsToRender;
    return uniqueFields([...headerCollapsedFieldsToRender, extra]);
  })();
  const bodyFieldsToRender = canHoistSingleBodyFieldIntoHeader ? [] : bodyFieldsToRenderBase;

  return { headerFieldsToRender, bodyFieldsToRender };
};
