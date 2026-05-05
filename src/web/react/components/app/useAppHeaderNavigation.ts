import { useCallback, useMemo } from 'react';

import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';
import {
  buildLandingUrl,
  navigateToTopLevel,
  resolveAdminEnabled,
  resolveHeaderDrawerEnabled,
  resolveServiceUrl
} from '../../app/headerNavigation';
import type { View } from '../../types';

type BlockingOverlayController = {
  lock: (args: { title: string; message: string; kind?: string; diagnosticMeta?: Record<string, unknown> }) => number;
  unlock: (seq: number, diagnosticMeta?: Record<string, unknown>) => void;
};

export const useAppHeaderNavigation = (args: {
  sidebarEnabled?: boolean | null;
  language: LangCode;
  view: View;
  navigateHomeBusy: BlockingOverlayController;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const { sidebarEnabled, language, view, navigateHomeBusy, onDiagnostic } = args;
  const serviceUrl = useMemo(() => resolveServiceUrl(), []);
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const drawerEnabled = useMemo(
    () => resolveHeaderDrawerEnabled(sidebarEnabled),
    [sidebarEnabled]
  );
  const layout: 'home' | 'detail' = view === 'list' ? 'home' : 'detail';
  const backLabel = useMemo(() => `← ${tSystem('app.apps', language, 'Apps')}`, [language]);
  const handleBack = useCallback(() => {
    const targetUrl = buildLandingUrl(serviceUrl, adminEnabled);
    onDiagnostic?.('ui.header.back.navigate', { targetUrl });
    const seq = navigateHomeBusy.lock({
      title: tSystem('navigation.waitTitle', language, 'Please wait'),
      message: tSystem('navigation.waitForms', language, 'Please wait while we open the forms page...')
    });
    globalThis.requestAnimationFrame?.(() => {
      globalThis.requestAnimationFrame?.(() => {
        navigateToTopLevel(targetUrl);
        globalThis.setTimeout?.(() => {
          navigateHomeBusy.unlock(seq, { targetUrl });
        }, 1500);
      });
    });
  }, [adminEnabled, language, navigateHomeBusy, onDiagnostic, serviceUrl]);

  return {
    drawerEnabled,
    layout,
    backLabel,
    handleBack
  };
};
