import React from 'react';

import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';
import { formatLineItemTotalValue } from '../domain/lineItemPresentation';

export const LineItemTableTotalsFooter: React.FC<{
  language: LangCode;
  tableColumns: Array<{ id: string; className?: string; style?: React.CSSProperties }>;
  totals: any[];
}> = ({ language, tableColumns, totals }) => {
  if (!totals.length) return null;

  const totalsById = new Map(totals.map(total => [total.key.toString(), total]));
  const nonRemoveColumns = tableColumns.filter(col => col.id !== '__remove');
  const preferred = nonRemoveColumns.find(col => !totalsById.has(col.id.toString()));
  const totalLabelColumnId = (preferred || nonRemoveColumns[0])?.id || '';

  return (
    <tr className="ck-line-item-table__totals-row">
      {tableColumns.map(col => {
        const total = col.id !== '__remove' ? totalsById.get(col.id.toString()) : undefined;
        const labelText = totalLabelColumnId && col.id === totalLabelColumnId ? tSystem('lineItems.total', language, 'Total') : '';
        const valueText = total ? formatLineItemTotalValue(total) : '';
        const cellText = [labelText, valueText].filter(Boolean).join(' ');
        return (
          <td key={`total-${col.id}`} className={col.className} style={col.style}>
            {cellText ? <span className="ck-line-item-table__total">{cellText}</span> : null}
          </td>
        );
      })}
    </tr>
  );
};
