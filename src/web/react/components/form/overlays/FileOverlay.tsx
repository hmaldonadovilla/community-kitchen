import React, { useEffect, useMemo } from 'react';
import { buttonStyles, withDisabled } from '../ui';
import { fileNameFromUrl, formatFileSize, isFileInstance, isHttpUrl } from '../utils';
import { FullPageOverlay } from './FullPageOverlay';
import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';

export type UploadConfigLike = {
  minFiles?: number;
  maxFiles?: number;
  maxFileSizeMb?: number;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
};

export type FileOverlayProps = {
  open: boolean;
  language: LangCode;
  title: string;
  zIndex?: number;
  submitting: boolean;
  readOnly?: boolean;
  items: Array<string | File>;
  uploadConfig?: UploadConfigLike;
  dirty?: boolean;
  saving?: boolean;
  saveError?: string;
  saveRetrying?: boolean;
  onAdd: () => void;
  onSave?: () => void;
  onRetrySave?: () => void;
  onClearAll: () => void;
  onRemoveAt: (index: number) => void;
  onClose: () => void;
};

export const FileOverlay: React.FC<FileOverlayProps> = ({
  open,
  language,
  title,
  zIndex = 10030,
  submitting,
  readOnly,
  items,
  uploadConfig,
  dirty,
  saving,
  saveError,
  saveRetrying,
  onAdd,
  onSave,
  onRetrySave,
  onClearAll,
  onRemoveAt,
  onClose
}) => {
  const files = useMemo(() => items.filter((it): it is File => isFileInstance(it)), [items]);
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + (file?.size || 0), 0), [files]);
  const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;
  const locked = submitting || saving === true || saveRetrying === true || readOnly === true;
  const canSave = Boolean(onSave) && !!dirty && !locked;

  const driveIdFromUrl = (url: string): string | null => {
    const m1 = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(url);
    if (m1?.[1]) return m1[1];
    const m2 = /[?&]id=([a-zA-Z0-9_-]+)/.exec(url);
    if (m2?.[1]) return m2[1];
    const m3 = /\/uc\?id=([a-zA-Z0-9_-]+)/.exec(url);
    if (m3?.[1]) return m3[1];
    return null;
  };

  const isLikelyImageName = (name: string): boolean => /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);

  const objectThumbSignature = useMemo(() => {
    if (!open) return '';
    return items
      .map((it, idx) => {
        if (!isFileInstance(it)) return `url:${idx}:${it}`;
        return `file:${idx}:${it.name}:${it.size}:${it.lastModified}:${it.type || ''}`;
      })
      .join('||');
  }, [items, open]);

  const objectThumbs = useMemo(() => {
    if (!open) return new Map<string, string>();
    const canObjectUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof URL.revokeObjectURL === 'function';
    if (!canObjectUrl) return new Map<string, string>();
    const map = new Map<string, string>();
    items.forEach((it, idx) => {
      if (!isFileInstance(it)) return;
      const file = it;
      if (!file.type?.startsWith('image/')) return;
      const key = `file-${idx}-${file.name}-${file.size}-${file.lastModified}`;
      map.set(key, URL.createObjectURL(file));
    });
    return map;
  }, [objectThumbSignature, open]);

  useEffect(() => {
    return () => {
      for (const url of objectThumbs.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [objectThumbs]);

  if (!open) return null;

  let selectionLabel = tSystem('files.noneSelected', language, 'No photo added.');
  if (items.length) {
    const base =
      items.length === 1
        ? tSystem('files.selectedOne', language, '1 photo added')
        : tSystem('files.selectedMany', language, '{count} photos added', { count: items.length });
    const bytesLabel = totalBytes ? ` • ${formatFileSize(totalBytes)}` : '';
    selectionLabel = `${base}${bytesLabel}`;
  }

  return (
    <FullPageOverlay
      open={open}
      zIndex={zIndex}
      title={title || tSystem('files.title', language, 'Photos')}
      subtitle={selectionLabel}
      rightAction={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={saving === true} style={withDisabled(buttonStyles.secondary, saving === true)}>
            {tSystem('common.close', language, 'Close')}
          </button>
          {onSave ? (
            <button type="button" onClick={onSave} disabled={!canSave} style={withDisabled(buttonStyles.primary, !canSave)}>
              {saving ? tSystem('common.loading', language, 'Loading…') : tSystem('files.save', language, 'Save photos')}
            </button>
          ) : null}
        </div>
      }
    >
      <fieldset
        disabled={locked}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          minInlineSize: 0,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div data-overlay-scroll-container="true" style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <button
              type="button"
              onClick={onAdd}
              disabled={locked || maxed}
              style={withDisabled(buttonStyles.primary, locked || maxed)}
            >
              {tSystem('files.add', language, 'Add photo')}
            </button>
            {items.length ? (
              <button
                type="button"
                onClick={() => {
                  const msg = tSystem('files.clearAllConfirm', language, 'Remove all photos?');
                  const ok =
                    typeof globalThis !== 'undefined' && typeof (globalThis as any).confirm === 'function'
                      ? (globalThis as any).confirm(msg)
                      : true;
                  if (!ok) return;
                  onClearAll();
                }}
                disabled={locked}
                style={withDisabled(buttonStyles.secondary, locked)}
              >
                {tSystem('files.clearAll', language, 'Remove all')}
              </button>
            ) : null}
            {maxed ? <span className="muted">{tSystem('files.maxReached', language, 'Required photos added.')}</span> : null}
          </div>

          {saveError ? (
            <div className="ck-upload-failure" role="alert">
              <span>{saveError}</span>
              {onRetrySave ? (
                <button
                  type="button"
                  className="ck-upload-failure__retry"
                  disabled={locked}
                  onClick={onRetrySave}
                >
                  {saveRetrying
                    ? tSystem('common.loading', language, 'Loading…')
                    : tSystem('files.retrySave', language, 'Try saving photos again')}
                </button>
              ) : null}
            </div>
          ) : null}

          {items.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item, idx) => {
                const isExisting = typeof item === 'string';
                let href: string | undefined;
                let name: string;
                let meta: string;
                if (isExisting) {
                  href = isHttpUrl(item) ? item : undefined;
                  name = fileNameFromUrl(item);
                  meta = tSystem('files.uploaded', language, 'Added');
                } else {
                  href = undefined;
                  name = item.name;
                  meta = formatFileSize(item.size || 0);
                }
                const thumbSize = 194;
                const thumbUrl = (() => {
                  if (isExisting && href) {
                    const driveId = driveIdFromUrl(href);
                    if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`;
                    if (isLikelyImageName(name)) return href;
                    return null;
                  }
                  if (!isExisting && item.type?.startsWith('image/')) {
                    const key = `file-${idx}-${item.name}-${item.size}-${item.lastModified}`;
                    return objectThumbs.get(key) || null;
                  }
                  return null;
                })();
                const thumbInner = thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                ) : (
                  <span className="muted" style={{ fontSize: 'var(--ck-font-control)', fontWeight: 600 }}>
                    {isExisting ? '↗' : '⧉'}
                  </span>
                );
                const thumbNode = href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                    aria-label={`${tSystem('common.open', language, 'Open')} ${name}`}
                  >
                    {thumbInner}
                  </a>
                ) : (
                  thumbInner
                );
                return (
                  <li
                    key={`${name}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div
                        style={{
                          width: thumbSize,
                          height: thumbSize,
                          borderRadius: 18,
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          overflow: 'hidden',
                          flex: '0 0 auto',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {thumbNode}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>
                          {name}
                        </div>
                        <div className="muted">
                          {meta}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAt(idx)}
                      disabled={locked}
                      style={withDisabled(buttonStyles.secondary, locked)}
                    >
                      {tSystem('lineItems.remove', language, 'Remove')}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="muted">{tSystem('files.emptyHint', language, 'No photo added.')}</div>
          )}
        </div>
      </fieldset>
    </FullPageOverlay>
  );
};
