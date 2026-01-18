import React from 'react';

import type { LineItemRowState } from '../../../types';

export type LineItemTableColumn = {
  id: string;
  label: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  renderCell: (row: LineItemRowState, rowIndex: number) => React.ReactNode;
};

export const LineItemTable: React.FC<{
  columns: LineItemTableColumn[];
  rows: LineItemRowState[];
  emptyText?: string;
  className?: string;
  rowClassName?: (row: LineItemRowState, rowIndex: number) => string | undefined;
  renderRowMessage?: (row: LineItemRowState, rowIndex: number) => React.ReactNode;
}> = ({ columns, rows, emptyText, className, rowClassName, renderRowMessage }) => {
  const colCount = columns.length || 1;
  const tableClass = ['ck-line-item-table', className].filter(Boolean).join(' ');

  return (
    <table className={tableClass}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.id} className={col.className} scope="col" style={col.style}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((row, idx) => {
            const messageNode = renderRowMessage?.(row, idx);
            return (
              <React.Fragment key={row.id}>
                <tr className={rowClassName?.(row, idx)}>
                  {columns.map(col => (
                    <td key={`${row.id}-${col.id}`} className={col.className} style={col.style}>
                      {col.renderCell(row, idx)}
                    </td>
                  ))}
                </tr>
                {messageNode ? (
                  <tr className="ck-line-item-table__message-row">
                    <td colSpan={colCount} className="ck-line-item-table__message-cell">
                      {messageNode}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })
        ) : (
          <tr>
            <td colSpan={colCount} className="ck-line-item-table__empty">
              {emptyText || 'No items yet.'}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

