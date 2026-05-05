import { useCallback, useState, type MutableRefObject } from 'react';

import { tSystem } from '../../../systemStrings';
import type { FieldValue, LangCode, WebFormDefinition } from '../../../types';
import { toUploadItems } from '../form/utils';
import { resolveLabel } from '../../utils/labels';

export type ReadOnlyFilesOverlayState = {
  open: boolean;
  fieldId?: string;
  title?: string;
  items: Array<string | File>;
  uploadConfig?: any;
};

const parseInlineUrlItems = (payload: string): string[] => {
  if (!payload) return [];
  try {
    const decoded = decodeURIComponent(payload);
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      return parsed.map(item => (item == null ? '' : item.toString())).filter(Boolean);
    }
  } catch {
    try {
      const decoded = decodeURIComponent(payload);
      return decoded
        .split('|')
        .map(part => (part || '').toString().trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
};

export const useReadOnlyFilesOverlay = (args: {
  definition: WebFormDefinition;
  valuesRef: MutableRefObject<Record<string, FieldValue>>;
  languageRef: MutableRefObject<LangCode>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const { definition, valuesRef, languageRef, logEvent } = args;
  const [readOnlyFilesOverlay, setReadOnlyFilesOverlay] = useState<ReadOnlyFilesOverlayState>({
    open: false,
    items: []
  });

  const closeReadOnlyFilesOverlay = useCallback(() => {
    setReadOnlyFilesOverlay(prev => ({ ...prev, open: false }));
    logEvent('filesOverlay.readOnly.close');
  }, [logEvent]);

  const openReadOnlyFilesOverlay = useCallback(
    (fieldIdRaw: string) => {
      const fieldId = (fieldIdRaw || '').toString().trim();
      if (!fieldId) return;

      if (fieldId.startsWith('urls:')) {
        const items = parseInlineUrlItems(fieldId.slice(5));
        if (!items.length) return;
        const title = tSystem('files.title', languageRef.current, 'Photos');
        setReadOnlyFilesOverlay({ open: true, fieldId, title, items, uploadConfig: undefined });
        logEvent('filesOverlay.readOnly.open.inline', { fieldId: 'urls', count: items.length });
        return;
      }

      const q = definition.questions.find(qq => qq && qq.type === 'FILE_UPLOAD' && qq.id === fieldId) as any;
      if (!q) {
        logEvent('filesOverlay.readOnly.unknownField', { fieldId });
        return;
      }
      const items = toUploadItems(valuesRef.current[fieldId] as any);
      const title = resolveLabel(q, languageRef.current) || tSystem('files.title', languageRef.current, 'Photos');
      const uploadConfig = (q as any)?.uploadConfig || undefined;
      setReadOnlyFilesOverlay({ open: true, fieldId, title, items, uploadConfig });
      logEvent('filesOverlay.readOnly.open', { fieldId, count: items.length });
    },
    [definition.questions, languageRef, logEvent, valuesRef]
  );

  return {
    readOnlyFilesOverlay,
    openReadOnlyFilesOverlay,
    closeReadOnlyFilesOverlay
  };
};
