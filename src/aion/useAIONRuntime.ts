import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotebookContext } from '../extensions/providers';
import {
  type AIONProvider,
  type AIONRuntimeStatus,
} from './runtime';
import { askAIONAboutPage, checkAIONLocal, checkAIONOnline } from './ollamaProvider';

const AION_PROVIDER_PREFERENCE = 'mathkhata.aion-provider';

function initialProvider(): AIONProvider {
  if (window.mathKhataDesktop || import.meta.env.DEV) return 'on-device';
  try {
    const stored = window.localStorage.getItem(AION_PROVIDER_PREFERENCE);
    if (stored === 'on-device' || stored === 'online') return stored;
  } catch {
    // Use capability-based selection when storage is unavailable.
  }
  const likelyMobile = window.matchMedia?.('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 1;
  return likelyMobile || !('gpu' in navigator) ? 'online' : 'on-device';
}

export interface AIONRuntimeState {
  status: AIONRuntimeStatus;
  progress?: number;
  message?: string;
  device?: 'ollama' | 'webgpu' | 'cloudflare';
  result?: string;
  elapsedSeconds: number;
  provider: AIONProvider;
  setProvider: (provider: AIONProvider) => void;
  enable: () => void;
  analyze: (context: NotebookContext, question?: string) => void;
  stop: () => void;
}

export function useAIONRuntime(): AIONRuntimeState {
  const requestRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [status, setStatus] = useState<AIONRuntimeStatus>('loading');
  const [progress, setProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [device, setDevice] = useState<'ollama' | 'webgpu' | 'cloudflare'>();
  const [result, setResult] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [provider, setProviderState] = useState<AIONProvider>(initialProvider);

  const setProvider = useCallback((next: AIONProvider) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setProviderState(next);
    try {
      window.localStorage.setItem(AION_PROVIDER_PREFERENCE, next);
    } catch {
      // The choice still applies for the current session.
    }
  }, []);

  const enable = useCallback(async () => {
    setStatus('loading');
    setResult(undefined);
    setMessage('Checking AION…');
    setProgress(undefined);
    setElapsedSeconds(0);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const local = provider === 'online' && !window.mathKhataDesktop
      ? await checkAIONOnline(controller.signal)
      : await checkAIONLocal(controller.signal);
    if (controller.signal.aborted) return;
    setMessage(local.message);
    if (local.modelReady) {
      setStatus('ready');
      setDevice(provider === 'online' && !window.mathKhataDesktop
        ? 'cloudflare'
        : window.mathKhataDesktop?.aion || import.meta.env.DEV ? 'ollama' : 'webgpu');
      setProgress(100);
    } else {
      setStatus(local.reachable ? 'idle' : 'error');
      setDevice(undefined);
    }
    if (requestRef.current === controller) requestRef.current = null;
  }, [provider]);

  const analyze = useCallback(async (context: NotebookContext, question?: string) => {
    if (status !== 'ready') return;
    setStatus('analyzing');
    setResult(undefined);
    setElapsedSeconds(0);
    startedAtRef.current = Date.now();
    setMessage(question ? 'AION is working through your question…' : 'AION is reading the current page…');
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const answer = await askAIONAboutPage(
        context,
        question,
        controller.signal,
        (visible) => {
          if (!controller.signal.aborted) setResult(visible);
        },
        (runtimeMessage, runtimeProgress) => {
          if (controller.signal.aborted) return;
          setMessage(runtimeMessage);
          if (runtimeProgress !== undefined) setProgress(runtimeProgress);
        },
        provider,
      );
      if (controller.signal.aborted) return;
      setResult(answer.text);
      if (startedAtRef.current !== null) {
        setElapsedSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1_000)));
        startedAtRef.current = null;
      }
      setStatus('ready');
      setMessage('AION completed the analysis.');
      setDevice(answer.runtime);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (startedAtRef.current !== null) {
        setElapsedSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1_000)));
        startedAtRef.current = null;
      }
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'AION could not complete the request.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [provider, status]);

  const stop = useCallback(() => {
    const request = requestRef.current;
    if (!request || request.signal.aborted) return;
    request.abort(new DOMException('AION generation stopped by the user.', 'AbortError'));
    requestRef.current = null;
    if (startedAtRef.current !== null) {
      setElapsedSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1_000)));
      startedAtRef.current = null;
    }
    setStatus((current) => current === 'analyzing' ? 'ready' : current);
    setMessage('Generation stopped.');
    setProgress(undefined);
  }, []);

  useEffect(() => {
    if (status !== 'analyzing') return;
    const timer = window.setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1_000)));
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    void enable();
    return () => requestRef.current?.abort();
  }, [enable]);

  return {
    status,
    progress,
    message,
    device,
    result,
    elapsedSeconds,
    provider,
    setProvider,
    enable,
    analyze,
    stop,
  };
}
