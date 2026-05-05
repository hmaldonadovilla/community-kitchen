import React from 'react';

import { SourceFirstSelectionCheckbox } from './SourceFirstSelectionCheckbox';

export const SourceFirstDataSourceRowShell: React.FC<{
  rowKey: string;
  last: boolean;
  showSelectionCheckbox: boolean;
  selected: boolean;
  headline: React.ReactNode;
  actions: React.ReactNode;
  showSentence: boolean;
  errors: string[];
  onSelectionChange: (checked: boolean) => void;
  children: React.ReactNode;
}> = ({
  rowKey,
  last,
  showSelectionCheckbox,
  selected,
  headline,
  actions,
  showSentence,
  errors,
  onSelectionChange,
  children
}) => (
  <div
    key={rowKey}
    style={{
      padding: '12px 0',
      borderBottom: !last ? '1px solid var(--border)' : undefined
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              flex: '1 1 280px',
              minWidth: 0
            }}
          >
            {showSelectionCheckbox ? (
              <SourceFirstSelectionCheckbox checked={selected} onChange={onSelectionChange} />
            ) : null}
            <div
              style={{
                fontSize: 'calc(var(--ck-font-control) * 1.16)',
                lineHeight: 1.35,
                overflowWrap: 'anywhere',
                flex: '1 1 280px',
                minWidth: 0
              }}
            >
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{headline}</span>
            </div>
          </div>
          {actions}
        </div>
        {showSentence ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: errors.length ? 6 : 0, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'nowrap',
                alignItems: 'center',
                columnGap: 6,
                rowGap: 6,
                minWidth: 0,
                lineHeight: 1.35,
                overflowX: 'auto'
              }}
            >
              {children}
            </div>
            {errors.length ? <div className="error">{errors[0]}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  </div>
);
