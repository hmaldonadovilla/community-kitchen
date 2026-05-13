import React from 'react';

import { SourceFirstSelectionCheckbox } from './SourceFirstSelectionCheckbox';

export const SourceFirstAllocationRow: React.FC<{
  rowKey: string;
  showAllocationLabel: boolean;
  allocationLabel?: string;
  showSelectionCheckbox: boolean;
  selected: boolean;
  errors: string[];
  onSelectionChange: (checked: boolean) => void;
  children: React.ReactNode;
}> = ({
  rowKey,
  showAllocationLabel,
  allocationLabel,
  showSelectionCheckbox,
  selected,
  errors,
  onSelectionChange,
  children
}) => (
  <div key={rowKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 8,
        paddingInlineStart: showAllocationLabel ? 12 : 0
      }}
    >
      {showAllocationLabel && allocationLabel ? (
        <span style={{ minWidth: 96, lineHeight: 1.35, fontWeight: 600 }}>
          {allocationLabel}
        </span>
      ) : null}
      {showSelectionCheckbox ? (
        <SourceFirstSelectionCheckbox checked={selected} variant="allocation" onChange={onSelectionChange} />
      ) : null}
      {selected ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: errors.length ? 4 : 0,
            minWidth: 0,
            maxWidth: '100%',
            flex: '1 1 220px'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              columnGap: 6,
              rowGap: 6,
              minWidth: 0,
              lineHeight: 1.35,
              overflowX: 'visible'
            }}
          >
            {children}
          </div>
          {errors.map((message, index) => (
            <div key={`${rowKey}:error:${index}`} className="error">
              {message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  </div>
);
