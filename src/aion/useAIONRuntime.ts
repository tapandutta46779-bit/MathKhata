import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotebookContext } from '../extensions/providers';
import {
  type AIONRuntimeStatus,
} from './runtime';
import { askAIONAboutPage, checkAIONLocal } from './ollamaProvider';

export interface AIONRuntimeState {
  status: AIONRuntimeStatus;
  progress?: number;
  message?: string;
  device?: 'ollama' | 'webgpu';
  result?: string;
  elapsedSeconds: number;
  enable: () => void;
  analyze: (context: NotebookContext, question?: string) => void;
  stop: () => void;
}

export function useAIONRuntime(): AIONRuntimeState {
  const requestRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<AIONRuntimeStatus>('loading');
  const [progress, setProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [device, setDevice] = useState<'ollama' | 'webgpu'>();
  const [result, setResult] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const enable = useCallback(async () => {
    setStatus('loading');
    setResult(undefined);
    setMessage('Checking AION…');
    setProgress(undefined);
    setElapsedSeconds(0);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const local = await checkAIONLocal(controller.signal);
    if (controller.signal.aborted) return;
    setMessage(local.message);
    if (local.modelReady) {
      setStatus('ready');
      setDevice(window.mathKhataDesktop?.aion || import.meta.env.DEV ? 'ollama' : 'webgpu');
      setProgress(100);
    } else {
      setStatus(local.reachable ? 'idle' : 'error');
      setDevice(undefined);
    }
    if (requestRef.current === controller) requestRef.current = null;
  }, []);

  const analyze = useCallback(async (context: NotebookContext, question?: string) => {
    if (status !== 'ready') return;
    setStatus('analyzing');
    setResult(undefined);
    setElapsedSeconds(0);
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
      );
      if (controller.signal.aborted) return;
      setResult(answer.text);
      setStatus('ready');
      setMessage('AION completed the analysis.');
      setDevice(answer.runtime);
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'AION could not complete the request.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [status]);

  const stop = useCallback(() => {
    const request = requestRef.current;
    if (!request || request.signal.aborted) return;
    request.abort(new DOMException('AION generation stopped by the user.', 'AbortError'));
    requestRef.current = null;
    setStatus((current) => current === 'analyzing' ? 'ready' : current);
    setMessage('Generation stopped.');
    setProgress(undefined);
  }, []);

  useEffect(() => {
    if (status !== 'analyzing') return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    void enable();
    return () => requestRef.current?.abort();
  }, [enable]);

  return { status, progress, message, device, result, elapsedSeconds, enable, analyze, stop };
}
