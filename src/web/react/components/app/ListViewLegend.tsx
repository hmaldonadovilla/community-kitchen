import React from 'react';
import { InlineMarkdown } from './InlineMarkdown';
import { ListViewIcon } from '../ListViewIcon';
import type { ResolvedListViewLegendItem } from '../../app/listViewLegend';
import { tSystem } from '../../../systemStrings';
import type { LangCode } from '../../../types';

type ListViewLegendProps = {
  items: ResolvedListViewLegendItem[];
  language: LangCode;
  columns?: number;
  columnWidths?: [number, number] | null;
  className?: string;
  style?: React.CSSProperties;
};

export const ListViewLegend: React.FC<ListViewLegendProps> = ({
  items,
  language,
  columns = 1,
  columnWidths = null,
  className,
  style
}) => {
  if (!items.length) return null;

  return (
    <div
      className={className ? `ck-list-legend ${className}` : 'ck-list-legend'}
      role="note"
      aria-label={tSystem('list.legend.title', language, 'Legend')}
      style={style}
    >
      <span className="ck-list-legend-title">{tSystem('list.legend.title', language, 'Legend')}:</span>
      <ul
        className="ck-list-legend-list"
        data-columns={columns > 1 ? '2' : '1'}
        style={columns > 1 && columnWidths ? { gridTemplateColumns: `${columnWidths[0]}% ${columnWidths[1]}%` } : undefined}
      >
        {items.map((item, idx) => (
          <li key={`legend-${item.icon || 'text'}-${idx}`} className="ck-list-legend-item">
            {item.icon ? <ListViewIcon name={item.icon} /> : null}
            {item.pill ? (
              <span className="ck-list-legend-pill" data-tone={item.pill.tone || 'default'}>
                {item.pill.text}
              </span>
            ) : null}
            <InlineMarkdown className="ck-list-legend-text" markdown={item.text} />
          </li>
        ))}
      </ul>
    </div>
  );
};
