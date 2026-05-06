import React from 'react';

import { resolveLocalizedString } from '../../../../i18n';
import type { LangCode } from '../../../../types';
import { buttonStyles } from '../../../components/form/ui';
import { LineItemTotals } from './LineItemTotals';

type LineItemSubgroupCollapseButtonProps = {
  subKey: string;
  collapsed: boolean;
  language: LangCode;
  onToggleCollapsed: () => void;
};

const LineItemSubgroupCollapseButton: React.FC<LineItemSubgroupCollapseButtonProps> = ({
  subKey,
  collapsed,
  language,
  onToggleCollapsed
}) => (
  <button
    type="button"
    onClick={onToggleCollapsed}
    aria-expanded={!collapsed}
    aria-controls={`${subKey}-body`}
    style={buttonStyles.secondary}
  >
    {collapsed
      ? resolveLocalizedString({ en: 'Show', fr: 'Afficher', nl: 'Tonen' }, language, 'Show')
      : resolveLocalizedString({ en: 'Hide', fr: 'Masquer', nl: 'Verbergen' }, language, 'Hide')}
  </button>
);

type LineItemSubgroupHeaderProps = {
  subKey: string;
  label: string;
  collapsed: boolean;
  inlineChromeHidden: boolean;
  language: LangCode;
  selectorControl?: React.ReactNode;
  addButton?: React.ReactNode;
  onToggleCollapsed: () => void;
};

export const LineItemSubgroupHeader: React.FC<LineItemSubgroupHeaderProps> = ({
  subKey,
  label,
  collapsed,
  inlineChromeHidden,
  language,
  selectorControl,
  addButton,
  onToggleCollapsed
}) => (
  <div
    className="subgroup-header"
    style={{ display: 'flex', flexDirection: 'column', gap: inlineChromeHidden ? 0 : 6 }}
  >
    {!inlineChromeHidden ? (
      <div style={{ textAlign: 'center', fontWeight: 600 }}>
        {label}
      </div>
    ) : null}
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1 }}>
        {selectorControl}
        {addButton}
      </div>
      {!inlineChromeHidden ? (
        <div style={{ marginLeft: 'auto' }}>
          <LineItemSubgroupCollapseButton
            subKey={subKey}
            collapsed={collapsed}
            language={language}
            onToggleCollapsed={onToggleCollapsed}
          />
        </div>
      ) : null}
    </div>
  </div>
);

type LineItemSubgroupToolbarProps = {
  subKey: string;
  collapsed: boolean;
  inlineChromeHidden: boolean;
  language: LangCode;
  totals: any[];
  selectorControl?: React.ReactNode;
  addButton?: React.ReactNode;
  setBottomRef: (element: HTMLDivElement | null) => void;
  onToggleCollapsed: () => void;
};

export const LineItemSubgroupToolbar: React.FC<LineItemSubgroupToolbarProps> = ({
  subKey,
  collapsed,
  inlineChromeHidden,
  language,
  totals,
  selectorControl,
  addButton,
  setBottomRef,
  onToggleCollapsed
}) => (
  <div ref={setBottomRef} className="line-item-toolbar" style={{ marginTop: 12 }}>
    <div
      className="line-item-toolbar-actions"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-end',
        flex: 1,
        flexWrap: 'wrap',
        justifyContent: 'space-between'
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {selectorControl}
        {addButton}
        <LineItemTotals totals={totals} />
      </div>
      {!inlineChromeHidden ? (
        <div style={{ marginLeft: 'auto' }}>
          <LineItemSubgroupCollapseButton
            subKey={subKey}
            collapsed={collapsed}
            language={language}
            onToggleCollapsed={onToggleCollapsed}
          />
        </div>
      ) : null}
    </div>
  </div>
);
