import React from 'react';

import type { LineItemRowState } from '../../../types';

export type LineItemTableColumn = {
  id: string;
  label: string;
  className?: string;
  renderCell: (row: LineItemRowState, rowIndex: number) => React.ReactNode;
};

export const LineItemTable: React.FC<{
  columns: LineItemTableColumn[];
  rows: LineItemRowState[];
  emptyText?: string;
  className?: string;
  rowClassName?: (row: LineItemRowState, rowIndex: number) => string | undefined;
}> = ({ columns, rows, emptyText, className, rowClassName }) => {
  const colCount = columns.length || 1;
  const tableClass = ['ck-line-item-table', className].filter(Boolean).join(' ');

  return (
    <table className={tableClass}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.id} className={col.className} scope="col">
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((row, idx) => (
            <tr key={row.id} className={rowClassName?.(row, idx)}>
              {columns.map(col => (
                <td key={`${row.id}-${col.id}`} className={col.className}>
                  {col.renderCell(row, idx)}
                </td>
              ))}
            </tr>
          ))
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

