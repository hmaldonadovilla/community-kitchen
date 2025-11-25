import { WebFormDefinition } from '../../types';
import { LangCode } from '../types';

interface ListViewOptions {
  mount: HTMLElement;
  definition: WebFormDefinition;
  language: LangCode;
  fetchRows?: () => Promise<any[]>;
}

export function renderListView(opts: ListViewOptions): void {
  const { mount, definition, language, fetchRows } = opts;
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

  fetchRows()
    .then(rows => {
      status.remove();
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      const header = document.createElement('tr');
      definition.questions.forEach(q => {
        const th = document.createElement('th');
        th.style.textAlign = 'left';
        th.style.borderBottom = '1px solid #e5e7eb';
        th.style.padding = '6px';
        th.textContent = q.label.en || q.id;
        header.appendChild(th);
      });
      table.appendChild(header);

      rows.forEach(row => {
        const tr = document.createElement('tr');
        definition.questions.forEach(q => {
          const td = document.createElement('td');
          td.style.padding = '6px';
          td.style.borderBottom = '1px solid #f1f5f9';
          td.textContent = row[q.id] || '';
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });

      mount.appendChild(table);
    })
    .catch(() => {
      status.textContent = language === 'FR' ? 'Erreur de chargement.' : language === 'NL' ? 'Fout bij laden.' : 'Failed to load.';
    });
}
