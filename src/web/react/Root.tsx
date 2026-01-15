import React, { useEffect, useState } from 'react';
import App from './App';
import { WebFormDefinition, WebFormSubmission } from '../types';
import { LoadingScreen } from './components/app/LoadingScreen';

export type AppPhase = 'bootstrapping' | 'loadingData' | 'ready' | 'error';

export interface RootProps {
  definition: WebFormDefinition;
  formKey: string;
  record?: WebFormSubmission | null;
}

const logBootEvent = (event: string, payload?: Record<string, unknown>): void => {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][boot]', event, payload || {});
  } catch (_) {
    // ignore logging failures
  }
};

export const Root: React.FC<RootProps> = ({ definition, formKey, record }) => {
  const [phase, setPhase] = useState<AppPhase>('bootstrapping');
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [allowRetry, setAllowRetry] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  useEffect(() => {
    let slowTimer: number | undefined;
    let retryTimer: number | undefined;
    let readyTimer: number | undefined;

    const startedAt = Date.now();

    setPhase('bootstrapping');
    setShowSlowMessage(false);
    setAllowRetry(false);
    setErrorMessage(null);
    logBootEvent('phase.enter', { phase: 'bootstrapping', formKey });

    slowTimer = (globalThis as any).setTimeout(() => {
      setShowSlowMessage(true);
      logBootEvent('slow.threshold', { formKey, elapsedMs: Date.now() - startedAt });
    }, 8000);

    retryTimer = (globalThis as any).setTimeout(() => {
      setAllowRetry(true);
      logBootEvent('retry.visible', { formKey, elapsedMs: Date.now() - startedAt });
    }, 10000);

    setPhase('loadingData');
    logBootEvent('phase.enter', { phase: 'loadingData', formKey });

    // Phase 1: we rely on the server-side bootstrap data already embedded in the page.
    // Mark the app ready on the next tick so the shell renders as soon as React mounts.
    readyTimer = (globalThis as any).setTimeout(() => {
      setPhase('ready');
      logBootEvent('phase.enter', { phase: 'ready', formKey, elapsedMs: Date.now() - startedAt });
    }, 0);

    return () => {
      if (typeof globalThis !== 'undefined') {
        if (slowTimer) (globalThis as any).clearTimeout(slowTimer);
        if (retryTimer) (globalThis as any).clearTimeout(retryTimer);
        if (readyTimer) (globalThis as any).clearTimeout(readyTimer);
      }
    };
  }, [formKey, retrySeq]);

  const handleRetry = () => {
    logBootEvent('retry.click', { formKey, phase });
    // For now, keep retry lightweight: re-run the bootstrap timers/state machine.
    // Future phases can wire this to a real data reload without a full page refresh.
    setRetrySeq(prev => prev + 1);
  };

  const showOverlay = phase !== 'ready';

  return (
    <>
      {showOverlay && (
        <LoadingScreen
          showSlowMessage={showSlowMessage}
          allowRetry={allowRetry}
          onRetry={handleRetry}
          errorMessage={errorMessage}
        />
      )}
      <App definition={definition} formKey={formKey} record={record || undefined} />
    </>
  );
};

export default Root;
