import React from 'react';

import { formatLineItemTotalValue } from '../domain/lineItemPresentation';

/**
 * Owner: line item UI.
 * Renders computed line-item totals. Total calculation remains in the caller.
 */
export const LineItemTotals: React.FC<{
  totals: any[];
  itemClassName?: string;
}> = ({ totals, itemClassName = 'pill' }) => {
  if (!totals.length) return null;

  return (
    <div className="line-item-totals">
      {totals.map(t => {
        const valueText = formatLineItemTotalValue(t);
        return (
          <span key={t.key} className={itemClassName}>
            {valueText ? `${t.label}: ${valueText}` : t.label}
          </span>
        );
      })}
    </div>
  );
};
