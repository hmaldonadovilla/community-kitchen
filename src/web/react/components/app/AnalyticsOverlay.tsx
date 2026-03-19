import React from 'react';
import type { AnalyticsSnapshotItem, LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { resolveLocalizedString } from '../../../i18n';
import { filterAnalyticsPageWidgets, formatAnalyticsValue } from '../../analytics/model';
import { buttonStyles } from '../form/ui';
import { FullPageOverlay } from '../form/overlays/FullPageOverlay';

const updatedText = (language: LangCode, updatedAt?: string): string => {
  const value = (updatedAt || '').toString().trim();
  if (!value) return '';
  return tSystem('analytics.updated', language, `Updated: ${value}`).replace('{value}', value);
};

export const AnalyticsPanel: React.FC<{
  language: LangCode;
  items?: AnalyticsSnapshotItem[] | null;
  loading?: boolean;
  error?: string | null;
  updatedAt?: string;
}> = ({ language, items, loading = false, error, updatedAt }) => {
  const widgets = filterAnalyticsPageWidgets(items);
  const updatedLabel = updatedText(language, updatedAt);

  return (
    <div data-overlay-scroll-container="true" style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {updatedLabel ? (
          <p className="muted" style={{ margin: 0 }}>
            {updatedLabel}
          </p>
        ) : null}

        {loading && !widgets.length ? (
          <p className="muted" style={{ margin: 0 }}>
            {tSystem('common.loading', language, 'Loading…')}
          </p>
        ) : null}

        {error ? (
          <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
            {error}
          </p>
        ) : null}

        {!loading && !error && !widgets.length ? (
          <p className="muted" style={{ margin: 0 }}>
            {tSystem('analytics.empty', language, 'No analytics widgets are configured.')}
          </p>
        ) : null}

        {widgets.length ? (
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
            }}
          >
            {widgets.map(item => {
              const label = resolveLocalizedString(item.label, language, item.id || '').trim() || item.id;
              const valueText = formatAnalyticsValue(item, language) || '-';
              return (
                <section
                  key={item.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 18,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    background: 'var(--bg)'
                  }}
                >
                  <div className="muted" style={{ fontWeight: 600 }}>
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--ck-font-group-title)',
                      fontWeight: 700,
                      lineHeight: 1.1,
                      wordBreak: 'break-word'
                    }}
                  >
                    {valueText}
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const AnalyticsOverlay: React.FC<{
  open: boolean;
  language: LangCode;
  title: string;
  subtitle?: string;
  items?: AnalyticsSnapshotItem[] | null;
  loading?: boolean;
  error?: string | null;
  updatedAt?: string;
  onClose: () => void;
}> = ({ open, language, title, subtitle, items, loading = false, error, updatedAt, onClose }) => {
  if (!open) return null;

  return (
    <FullPageOverlay
      open={open}
      zIndex={10040}
      title={title}
      subtitle={subtitle}
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.primary}>
          {tSystem('common.close', language, 'Close')}
        </button>
      }
    >
      <AnalyticsPanel language={language} items={items} loading={loading} error={error} updatedAt={updatedAt} />
    </FullPageOverlay>
  );
};
