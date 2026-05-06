import { DataSourceConfig, WebFormDefinition } from '../../types';

const normalizeStringArray = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (v === undefined || v === null ? '' : `${v}`.trim()))
    .filter(Boolean);
};

const isLikelyDataSourceConfig = (value: any): value is DataSourceConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const id = (value as any).id;
  if (typeof id !== 'string' || !id.trim()) return false;
  const hasDataSourceShape =
    'projection' in value ||
    'sheetId' in value ||
    'tabName' in value ||
    'localeKey' in value ||
    'statusFieldId' in value ||
    'statusAllowList' in value ||
    'limit' in value ||
    'mapping' in value ||
    'mode' in value ||
    'ref' in value ||
    'tooltipField' in value ||
    'tooltipLabel' in value;
  return Boolean(hasDataSourceShape);
};

const signatureForDedupe = (cfg: DataSourceConfig): string => {
  const projection = normalizeStringArray((cfg as any).projection).sort();
  const statusAllowList = normalizeStringArray((cfg as any).statusAllowList).map(v => v.toLowerCase()).sort();
  const limitRaw = (cfg as any).limit;
  const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null;
  const sig = {
    id: (cfg.id || '').toString(),
    sheetId: ((cfg as any).sheetId || '').toString(),
    tabName: ((cfg as any).tabName || '').toString(),
    localeKey: ((cfg as any).localeKey || '').toString(),
    statusFieldId: ((cfg as any).statusFieldId || '').toString(),
    mode: ((cfg as any).mode || '').toString(),
    ref: ((cfg as any).ref || '').toString(),
    projection,
    statusAllowList,
    limit
  };
  return JSON.stringify(sig);
};

export const collectDataSourceConfigsForPrefetch = (definition: WebFormDefinition): DataSourceConfig[] => {
  const out: DataSourceConfig[] = [];
  const seen = new Set<string>();
  const visited = new Set<any>();

  const add = (cfg: DataSourceConfig) => {
    const sig = signatureForDedupe(cfg);
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push(cfg);
  };

  const visit = (value: any, depth: number) => {
    if (depth > 10) return;
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);

    if (isLikelyDataSourceConfig(value)) {
      add(value);
    }

    if (Array.isArray(value)) {
      value.forEach(v => visit(v, depth + 1));
      return;
    }

    Object.keys(value).forEach(k => {
      // Follow-up actions execute on the server and resolve their own data-source
      // dependencies there. Client prefetch should not warm server-only email/PDF
      // lookup sources just to send the record id back to the backend.
      if (k === 'followup') return;
      const child = (value as any)[k];
      if (!child) return;
      if (k === 'dataSource' && isLikelyDataSourceConfig(child)) {
        add(child);
        return;
      }
      visit(child, depth + 1);
    });
  };

  visit(definition, 0);
  return out;
};

export const isHomePrefetchEligibleDataSource = (config: DataSourceConfig | null | undefined): boolean => {
  if (!config || typeof config !== 'object') return false;
  if ((config as any).prefetchOnHome === true) return true;
  const hasTransactionalStatusFilter =
    !!`${(config as any).statusFieldId || ''}`.trim() &&
    normalizeStringArray((config as any).statusAllowList).length > 0;
  if (hasTransactionalStatusFilter) return false;
  if ((config as any).backfill && typeof (config as any).backfill === 'object') return false;
  return true;
};
