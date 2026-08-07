import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotebookContext } from '../extensions/providers';
import {
  createAIONPagePrompt,
  type AIONRuntimeStatus,
  type AIONWorkerResponse,
} from './runtime';

export interface AIONRuntimeState {
  status: AIONRuntimeStatus;
  progress?: number;
  message?: string;
  device?: 'webgpu' | 'wasm';
  result?: string;
  enable: () => void;
  analyze: (context: NotebookContext) => void;
}

export function useAIONRuntime(): AIONRuntimeState {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<AIONRuntimeStatus>('idle');
  const [progress, setProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [device, setDevice] = useState<'webgpu' | 'wasm'>();
  const [result, setResult] = useState<string>();

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL('./aion.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<AIONWorkerResponse>) => {
      const response = event.data;
      if (response.type === 'progress') {
        setStatus('loading');
        setProgress(response.progress);
        setMessage(response.message);
      } else if (response.type === 'ready') {
        setStatus('ready');
        setProgress(100);
        setMessage('Cached locally and ready');
        setDevice(response.device);
      } else if (response.type === 'result') {
        setStatus('ready');
        setResult(response.text);
        setMessage('Analysis completed locally');
      } else {
        setStatus('error');
        setMessage(response.message);
      }
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const enable = useCallback(() => {
    setStatus('loading');
    setResult(undefined);
    setMessage('Starting the optional download…');
    ensureWorker().postMessage({ type: 'load' });
  }, [ensureWorker]);

  const analyze = useCallback((context: NotebookContext) => {
    if (status !== 'ready') return;
    setStatus('analyzing');
    setResult(undefined);
    setMessage('Reading the current page locally…');
    ensureWorker().postMessage({ type: 'analyze', prompt: createAIONPagePrompt(context) });
  }, [ensureWorker, status]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return { status, progress, message, device, result, enable, analyze };
}
