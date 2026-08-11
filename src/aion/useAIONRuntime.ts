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
  device?: 'ollama';
  result?: string;
  enable: () => void;
  analyze: (context: NotebookContext, question?: string) => void;
}

export function useAIONRuntime(): AIONRuntimeState {
  const requestRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<AIONRuntimeStatus>('loading');
  const [progress, setProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [device, setDevice] = useState<'ollama'>();
  const [result, setResult] = useState<string>();

  const enable = useCallback(async () => {
    setStatus('loading');
    setResult(undefined);
    setMessage('Checking the Local Qwen Assistant…');
    setProgress(undefined);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const local = await checkAIONLocal(controller.signal);
    if (controller.signal.aborted) return;
    setMessage(local.message);
    if (local.modelReady) {
      setStatus('ready');
      setDevice('ollama');
      setProgress(100);
    } else {
      setStatus(local.reachable ? 'idle' : 'error');
      setDevice(undefined);
    }
  }, []);

  const analyze = useCallback(async (context: NotebookContext, question?: string) => {
    if (status !== 'ready') return;
    setStatus('analyzing');
    setResult(undefined);
    setMessage(question ? 'Local Qwen is working through your question…' : 'Local Qwen is reading the current page…');
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const answer = await askAIONAboutPage(context, question, controller.signal, (visible) => {
        if (!controller.signal.aborted) setResult(visible);
      });
      if (controller.signal.aborted) return;
      setResult(answer.text);
      setStatus('ready');
      setMessage('Local Qwen completed the analysis.');
      setDevice('ollama');
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'The Local Qwen Assistant could not complete the request.');
    }
  }, [status]);

  useEffect(() => {
    void enable();
    return () => requestRef.current?.abort();
  }, [enable]);

  return { status, progress, message, device, result, enable, analyze };
}
