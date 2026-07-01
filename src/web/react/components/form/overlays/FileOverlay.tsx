import React, { useEffect, useMemo, useState } from 'react';
import { buttonStyles, withDisabled } from '../ui';
import { fileNameFromUrl, getUploadMinRequired, isFileInstance, isHttpUrl } from '../utils';
import { FullPageOverlay } from './FullPageOverlay';
import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';
import {
  buildExistingFileThumbnailCandidates,
  buildLocalFileThumbnailKey
} from './fileOverlayThumbnails';

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
  savedItems?: Array<string | File>;
  uploadConfig?: UploadConfigLike;
  dirty?: boolean;
  saving?: boolean;
  notice?: string;
  noticeTone?: 'warning' | 'error';
  saveError?: string;
  saveRetrying?: boolean;
  getItemError?: (item: string | File, index: number) => string;
  linkCapture?: {
    scanLabel: string;
    pasteLabel: string;
    pastePlaceholder: string;
    pasteSubmitLabel: string;
    unsupportedMessage: string;
    scanSupported: boolean;
    allowManualPaste: boolean;
  };
  onAdd: () => void;
  onScanLink?: () => void;
  onAddLink?: (value: string) => boolean;
  onSave?: () => void;
  onRetrySave?: () => void;
  onClearAll: () => void;
  onRemoveAt: (index: number) => void;
  onClose: () => void;
};

const ThumbnailImage: React.FC<{
  alt: string;
  candidates: string[];
  fallback: React.ReactNode;
}> = ({ alt, candidates, fallback }) => {
  const signature = candidates.join('\n');
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [signature]);

  const src = candidates[candidateIndex];
  if (!src) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      loading="eager"
      decoding="async"
      onError={() => setCandidateIndex(current => current + 1)}
    />
  );
};

export const FileOverlay: React.FC<FileOverlayProps> = ({
  open,
  language,
  title,
  zIndex = 10030,
  submitting,
  readOnly,
  items,
  savedItems,
  uploadConfig,
  dirty,
  saving,
  notice,
  noticeTone = 'warning',
  saveError,
  saveRetrying,
  getItemError,
  linkCapture,
  onAdd,
  onScanLink,
  onAddLink,
  onSave,
  onRetrySave,
  onClearAll,
  onRemoveAt,
  onClose
}) => {
  const subtitleItems = savedItems || items;
  const minRequired = getUploadMinRequired({ uploadConfig, required: false });
  const maxFiles = uploadConfig?.maxFiles && uploadConfig.maxFiles > 0 ? uploadConfig.maxFiles : undefined;
  const denominator = maxFiles ?? (minRequired > 0 ? minRequired : undefined);
  const maxed = uploadConfig?.maxFiles ? items.length >= uploadConfig.maxFiles : false;
  const locked = submitting || saving === true || saveRetrying === true || readOnly === true;
  const canSave = Boolean(onSave) && !!dirty && !locked;
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkInputValue, setLinkInputValue] = useState('');

  const [dataThumbs, setDataThumbs] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!open) {
      setDataThumbs(new Map());
      return;
    }
    const imageFiles = items
      .map((it, idx) => (isFileInstance(it) && it.type?.startsWith('image/') ? { file: it, key: buildLocalFileThumbnailKey(it, idx) } : null))
      .filter(Boolean) as Array<{ file: File; key: string }>;

    if (!imageFiles.length || typeof FileReader === 'undefined') {
      setDataThumbs(new Map());
      return;
    }

    let cancelled = false;
    Promise.all(
      imageFiles.map(
        entry =>
          new Promise<[string, string | null]>(resolve => {
            try {
              const reader = new FileReader();
              reader.onload = () => resolve([entry.key, typeof reader.result === 'string' ? reader.result : null]);
              reader.onerror = () => resolve([entry.key, null]);
              reader.readAsDataURL(entry.file);
            } catch {
              resolve([entry.key, null]);
            }
          })
      )
    ).then(results => {
      if (cancelled) return;
      const next = new Map<string, string>();
      results.forEach(([key, value]) => {
        if (value) next.set(key, value);
      });
      setDataThumbs(next);
    });

    return () => {
      cancelled = true;
    };
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
      const key = buildLocalFileThumbnailKey(file, idx);
      map.set(key, URL.createObjectURL(file));
    });
    return map;
  }, [items, open]);

  useEffect(() => {
    return () => {
      for (const url of objectThumbs.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [objectThumbs]);

  useEffect(() => {
    if (!open) {
      setLinkInputOpen(false);
      setLinkInputValue('');
    }
  }, [open]);

  if (!open) return null;

  let selectionLabel = tSystem('files.noneSelected', language, 'No photo added.');
  if (denominator) {
    selectionLabel = `${Math.min(subtitleItems.length, denominator)}/${denominator}`;
  } else if (subtitleItems.length) {
    selectionLabel =
      subtitleItems.length === 1
        ? tSystem('files.selectedOne', language, '1 photo added')
        : tSystem('files.selectedMany', language, '{count} photos added', { count: subtitleItems.length });
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
            {linkCapture?.scanSupported ? (
              <button
                type="button"
                onClick={onScanLink}
                disabled={locked || maxed || !onScanLink}
                style={withDisabled(buttonStyles.secondary, locked || maxed || !onScanLink)}
              >
                {linkCapture.scanLabel}
              </button>
            ) : null}
            {linkCapture?.allowManualPaste ? (
              <button
                type="button"
                onClick={() => setLinkInputOpen(current => !current)}
                disabled={locked || maxed || !onAddLink}
                style={withDisabled(buttonStyles.secondary, locked || maxed || !onAddLink)}
              >
                {linkCapture.pasteLabel}
              </button>
            ) : null}
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
            {linkCapture && !linkCapture.scanSupported && linkCapture.unsupportedMessage ? (
              <span className="muted">{linkCapture.unsupportedMessage}</span>
            ) : null}
          </div>

          {linkInputOpen && linkCapture ? (
            <form
              onSubmit={event => {
                event.preventDefault();
                const accepted = onAddLink?.(linkInputValue.trim()) || false;
                if (accepted) {
                  setLinkInputValue('');
                  setLinkInputOpen(false);
                }
              }}
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}
            >
              <input
                type="text"
                inputMode="url"
                value={linkInputValue}
                onChange={event => setLinkInputValue(event.currentTarget.value)}
                placeholder={linkCapture.pastePlaceholder}
                disabled={locked || maxed}
                style={{
                  flex: '1 1 260px',
                  minWidth: 0,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  font: 'inherit',
                  background: 'var(--card)',
                  color: 'var(--text)'
                }}
              />
              <button
                type="submit"
                disabled={locked || maxed || !linkInputValue.trim()}
                style={withDisabled(buttonStyles.primary, locked || maxed || !linkInputValue.trim())}
              >
                {linkCapture.pasteSubmitLabel}
              </button>
            </form>
          ) : null}

          {notice ? (
            <div
              className={`ck-upload-notice ck-upload-notice--${noticeTone}`}
              role={noticeTone === 'error' ? 'alert' : 'status'}
            >
              {notice}
            </div>
          ) : null}

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
                const itemError = getItemError?.(item, idx) || '';
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
                  meta = saving ? tSystem('common.loading', language, 'Loading…') : tSystem('files.pending', language, 'Pending');
                }
                const thumbSize = 194;
                const thumbCandidates = (() => {
                  if (isExisting && href) {
                    return buildExistingFileThumbnailCandidates(href, name);
                  }
                  if (!isExisting && item.type?.startsWith('image/')) {
                    const key = buildLocalFileThumbnailKey(item, idx);
                    return [dataThumbs.get(key), objectThumbs.get(key)].filter(Boolean) as string[];
                  }
                  return [];
                })();
                const thumbFallback = (
                  <span className="muted" style={{ fontSize: 'var(--ck-font-control)', fontWeight: 600 }}>
                    {isExisting ? '↗' : '⧉'}
                  </span>
                );
                const thumbInner = thumbCandidates.length ? (
                  <ThumbnailImage alt={name} candidates={thumbCandidates} fallback={thumbFallback} />
                ) : (
                  thumbFallback
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
                      border: itemError ? '2px solid var(--danger)' : '1px solid var(--border)',
                      borderRadius: 12,
                      gap: 12,
                      boxShadow: itemError ? '0 0 0 1px var(--danger)' : undefined
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
                        {itemError ? (
                          <div role="alert" style={{ color: 'var(--danger)', fontWeight: 600, marginTop: 4 }}>
                            {itemError}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {!itemError ? (
                      <button
                        type="button"
                        onClick={() => onRemoveAt(idx)}
                        disabled={locked}
                        style={withDisabled(buttonStyles.secondary, locked)}
                      >
                        {tSystem('lineItems.remove', language, 'Remove')}
                      </button>
                    ) : null}
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
