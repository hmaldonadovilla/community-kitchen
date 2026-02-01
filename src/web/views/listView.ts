import { ListViewConfig, WebFormDefinition } from '../../types';
import { LangCode, PaginatedResult } from '../types';

interface ListViewOptions {
  mount: HTMLElement;
  definition: WebFormDefinition;
  language: LangCode;
  fetchRows?: (pageToken?: string) => Promise<PaginatedResult<Record<string, any>>>;
  onSelectRow?: (row: Record<string, any>) => void;
}

export function renderListView(opts: ListViewOptions): void {
  const { mount, definition, language, fetchRows, onSelectRow } = opts;
  mount.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = definition.title + ' - List';
  mount.appendChild(title);

  const status = document.createElement('div');
  status.textContent = 'Loading...';
  mount.appendChild(status);

  if (!fetchRows) {
    status.textContent = language === 'FR' ? 'Aucune source de données.' : language === 'NL' ? 'Geen gegevensbron.' : 'No data source.';
    return;
  }

  const config: ListViewConfig | undefined = definition.listView;
  const columns = config?.columns && config.columns.length ? config.columns : definition.questions.map(q => ({ fieldId: q.id, label: q.label }));

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  const header = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.style.textAlign = 'left';
    th.style.borderBottom = '1px solid var(--border)';
    th.style.padding = '6px';
    th.textContent = resolveLabel(col.label, col.fieldId, language);
    header.appendChild(th);
  });
  const thMeta = document.createElement('th');
  thMeta.style.textAlign = 'left';
  thMeta.style.borderBottom = '1px solid var(--border)';
  thMeta.style.padding = '6px';
  thMeta.textContent = 'Updated';
  header.appendChild(thMeta);
  table.appendChild(header);

  const pager = document.createElement('div');
  pager.style.margin = '8px 0';

  let nextToken: string | undefined;

  const renderPage = (token?: string) => {
    status.textContent = language === 'FR' ? 'Chargement...' : language === 'NL' ? 'Bezig met laden...' : 'Loading...';
    fetchRows(token)
      .then(res => {
        status.textContent = '';
        table.querySelectorAll('tr:not(:first-child)').forEach(row => row.remove());

        (res.items || []).forEach(row => {
          const tr = document.createElement('tr');
          tr.style.cursor = onSelectRow ? 'pointer' : 'default';
          columns.forEach(col => {
            const td = document.createElement('td');
            td.style.padding = '6px';
            td.style.borderBottom = '1px solid var(--border)';
            td.textContent = valueToString(row[col.fieldId]);
            tr.appendChild(td);
          });
          const meta = document.createElement('td');
          meta.style.padding = '6px';
          meta.style.borderBottom = '1px solid var(--border)';
          meta.textContent = row.updatedAt || row.createdAt || '';
          tr.appendChild(meta);
          if (onSelectRow) {
            tr.addEventListener('click', () => onSelectRow(row));
          }
          table.appendChild(tr);
        });

        nextToken = res.nextPageToken;
        pager.innerHTML = '';
        if (nextToken) {
          const btn = document.createElement('button');
          btn.textContent = language === 'FR' ? 'Suivant' : language === 'NL' ? 'Volgende' : 'Next';
          btn.addEventListener('click', () => renderPage(nextToken));
          pager.appendChild(btn);
        } else if (!res.items || !res.items.length) {
          status.textContent = language === 'FR' ? 'Aucune donnée.' : language === 'NL' ? 'Geen gegevens.' : 'No data.';
        }
      })
      .catch(() => {
        status.textContent = language === 'FR' ? 'Erreur de chargement.' : language === 'NL' ? 'Fout bij laden.' : 'Failed to load.';
      });
  };

  mount.appendChild(table);
  mount.appendChild(pager);
  renderPage();
}

function resolveLabel(label: any, fallback: string, language: LangCode): string {
  if (!label) return fallback;
  if (typeof label === 'string') return label;
  const key = (language || 'en').toString().toLowerCase();
  return label[key] || label.en || fallback;
}

function valueToString(val: any): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.join(', ');
  if (val instanceof Date) return val.toISOString();
  return val.toString();
}
