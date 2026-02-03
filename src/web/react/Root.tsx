import React, { useEffect, useRef, useState } from 'react';
import App from './App';
import { WebFormDefinition, WebFormSubmission } from '../types';
import { LoadingScreen } from './components/app/LoadingScreen';
import { fetchBootstrapContextApi } from './api';
import { readCachedFormDefinition, writeCachedFormDefinition, StorageLike } from '../data/formDefinitionCache';

export type AppPhase = 'bootstrapping' | 'loadingData' | 'ready' | 'error';

export interface RootProps {
  definition?: WebFormDefinition | null;
  formKey: string;
  record?: WebFormSubmission | null;
  envTag?: string | null;
}

const logBootEvent = (event: string, payload?: Record<string, unknown>): void => {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][boot]', event, payload || {});
  } catch (_) {
    // ignore logging failures
  }
};

export const Root: React.FC<RootProps> = ({ definition: initialDefinition, formKey, record, envTag: initialEnvTag }) => {
  const [phase, setPhase] = useState<AppPhase>('bootstrapping');
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [allowRetry, setAllowRetry] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);
  const [definition, setDefinition] = useState<WebFormDefinition | null>(initialDefinition ?? null);
  const [activeFormKey, setActiveFormKey] = useState(formKey);
  const [activeRecord, setActiveRecord] = useState<WebFormSubmission | null>(record ?? null);
  const [envTag, setEnvTag] = useState<string | null>(() => {
    const globalAny = globalThis as any;
    const bootstrapTag = globalAny?.__WEB_FORM_BOOTSTRAP__?.envTag;
    const raw = (bootstrapTag ?? initialEnvTag ?? '').toString().trim();
    return raw ? raw : null;
  });
  const definitionRef = useRef<WebFormDefinition | null>(initialDefinition ?? null);

  const resolveLocalStorage = (): StorageLike | null => {
    try {
      const storage = (globalThis as any)?.localStorage;
      if (!storage) return null;
      if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
        return null;
      }
      return storage as StorageLike;
    } catch (_) {
      return null;
    }
  };

  const resolveCacheVersion = (): string => {
    try {
      const raw = (globalThis as any)?.__CK_CACHE_VERSION__;
      return (raw ?? '').toString().trim();
    } catch (_) {
      return '';
    }
  };

  useEffect(() => {
    definitionRef.current = definition;
  }, [definition]);

  useEffect(() => {
    let slowTimer: number | undefined;
    let retryTimer: number | undefined;
    let cancelled = false;

    const startedAt = Date.now();

    setPhase('bootstrapping');
    setShowSlowMessage(false);
    setAllowRetry(false);
    setErrorMessage(null);
    logBootEvent('phase.enter', { phase: 'bootstrapping', formKey });

    slowTimer = (globalThis as any).setTimeout(() => {
      setShowSlowMessage(true);
      logBootEvent('slow.threshold', { formKey, elapsedMs: Date.now() - startedAt });
    }, 10000);

    retryTimer = (globalThis as any).setTimeout(() => {
      setAllowRetry(true);
      logBootEvent('retry.visible', { formKey, elapsedMs: Date.now() - startedAt });
    }, 10000);

    const loadBootstrap = async () => {
      setPhase('loadingData');
      logBootEvent('phase.enter', { phase: 'loadingData', formKey });

      let currentDefinition = definitionRef.current;

      const hasExplicitFormKey = !!(formKey && formKey.toString().trim());
      let resolvedKey = activeFormKey || formKey;

      if (!currentDefinition) {
        const storage = resolveLocalStorage();
        const cacheVersion = resolveCacheVersion();
        if (storage && cacheVersion) {
          const cached = readCachedFormDefinition({ storage, formKey: formKey || '', cacheVersion });
          if (cached) {
            setDefinition(cached);
            currentDefinition = cached;
            logBootEvent('config.cache.hydrate', { formKey: formKey || null, cacheVersion });
          }
        }
      }

      const needsBootstrap = !currentDefinition || (hasExplicitFormKey && activeFormKey && activeFormKey !== formKey);

      if (needsBootstrap) {
        const globalAny = globalThis as any;
        const preloaded = globalAny?.__WEB_FORM_BOOTSTRAP__?.definition;
        if (preloaded && typeof preloaded === 'object') {
          const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || {};
          setDefinition(bootstrap.definition);
          resolvedKey = bootstrap.formKey || formKey;
          setActiveFormKey(resolvedKey);
          setActiveRecord(bootstrap.record ?? null);
          const resolvedEnvTag = (bootstrap.envTag || '').toString().trim();
          setEnvTag(resolvedEnvTag ? resolvedEnvTag : null);
          logBootEvent('bootstrap.prefetch.used', { formKey: resolvedKey || null });

          const storage = resolveLocalStorage();
          const cacheVersion = resolveCacheVersion();
          if (storage && cacheVersion && bootstrap?.definition) {
            writeCachedFormDefinition({ storage, formKey: formKey || '', cacheVersion, definition: bootstrap.definition });
            if (resolvedKey && resolvedKey !== (formKey || '')) {
              writeCachedFormDefinition({ storage, formKey: resolvedKey, cacheVersion, definition: bootstrap.definition });
            }
            logBootEvent('config.cache.write', { formKey: resolvedKey || null, cacheVersion });
          }
        } else {
          logBootEvent('bootstrap.fetch.start', { formKey });
          try {
            const promise = globalAny?.__CK_BOOTSTRAP_PROMISE__;
            const res = promise ? await promise : await fetchBootstrapContextApi(formKey || null);
            if (cancelled) return;
            setDefinition(res.definition);
            resolvedKey = res.formKey || formKey;
            setActiveFormKey(resolvedKey);
            setActiveRecord(res.record ?? null);
            const resolvedEnvTag = (res.envTag || '').toString().trim();
            setEnvTag(resolvedEnvTag ? resolvedEnvTag : null);
            const configSource = res.configSource || 'sheet';
            const configEnv = (res.configEnv || '').toString().trim();
            logBootEvent('bootstrap.fetch.success', {
              formKey: resolvedKey,
              elapsedMs: Date.now() - startedAt,
              configSource,
              configEnv: configEnv || 'default'
            });
            logBootEvent('config.source', { formKey: resolvedKey, source: configSource });
            logBootEvent('config.env', { formKey: resolvedKey, env: configEnv || 'default' });
            logBootEvent('ui.envTag', { formKey: resolvedKey, envTag: resolvedEnvTag || null });

            const storage = resolveLocalStorage();
            const cacheVersion = resolveCacheVersion();
            if (storage && cacheVersion && res?.definition) {
              writeCachedFormDefinition({ storage, formKey: formKey || '', cacheVersion, definition: res.definition });
              if (resolvedKey && resolvedKey !== (formKey || '')) {
                writeCachedFormDefinition({ storage, formKey: resolvedKey, cacheVersion, definition: res.definition });
              }
              logBootEvent('config.cache.write', { formKey: resolvedKey || null, cacheVersion });
            }
          } catch (err: any) {
            if (cancelled) return;
            const message = err?.message ? err.message.toString() : 'Request failed';
            setErrorMessage('We couldn’t load the form configuration. Please try again.');
            setAllowRetry(true);
            setPhase('error');
            logBootEvent('bootstrap.fetch.error', {
              formKey,
              elapsedMs: Date.now() - startedAt,
              message
            });
            return;
          }
        }
      }

      if (cancelled) return;
      setPhase('ready');
      logBootEvent('phase.enter', { phase: 'ready', formKey: resolvedKey, elapsedMs: Date.now() - startedAt });
    };

    loadBootstrap();

    return () => {
      cancelled = true;
      if (typeof globalThis !== 'undefined') {
        if (slowTimer) (globalThis as any).clearTimeout(slowTimer);
        if (retryTimer) (globalThis as any).clearTimeout(retryTimer);
      }
    };
  }, [formKey, retrySeq]);

  const handleRetry = () => {
    logBootEvent('retry.click', { formKey, phase });
    // For now, keep retry lightweight: re-run the bootstrap timers/state machine.
    // Future phases can wire this to a real data reload without a full page refresh.
    setRetrySeq(prev => prev + 1);
  };

  const showLoading = phase !== 'ready' || !definition;

  return (
    <>
      {showLoading && (
        <LoadingScreen
          showSlowMessage={showSlowMessage}
          allowRetry={allowRetry}
          onRetry={handleRetry}
          errorMessage={errorMessage}
        />
      )}
      {!showLoading && definition && (
        <App
          definition={definition}
          formKey={activeFormKey || formKey}
          record={activeRecord || undefined}
          envTag={envTag || undefined}
        />
      )}
    </>
  );
};

export default Root;
