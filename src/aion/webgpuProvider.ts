import {
  CreateWebWorkerMLCEngine,
  type InitProgressReport,
  type WebWorkerMLCEngine,
} from '@mlc-ai/web-llm';
import { AION_SYSTEM_PROMPT } from './systemPrompt';

export const AION_WEBGPU_MODEL = 'Qwen3-8B-q4f16_1-MLC';

export interface AIONWebGPUOptions {
  signal?: AbortSignal;
  json?: boolean;
  temperature?: number;
  onUpdate?: (text: string) => void;
  onStatus?: (message: string, progress?: number) => void;
}

let enginePromise: Promise<WebWorkerMLCEngine> | null = null;
let worker: Worker | null = null;
let generationActive = false;
const progressListeners = new Set<NonNullable<AIONWebGPUOptions['onStatus']>>();

export function canUseAIONWebGPU(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return window.isSecureContext && 'gpu' in navigator;
}

function reportProgress(report: InitProgressReport) {
  const progress = Number.isFinite(report.progress)
    ? Math.max(0, Math.min(100, Math.round(report.progress * 100)))
    : undefined;
  const message = report.text?.trim() || 'Preparing AION on this device…';
  progressListeners.forEach((listener) => listener(message, progress));
}

function resetEngine() {
  worker?.terminate();
  worker = null;
  enginePromise = null;
  generationActive = false;
}

async function loadEngine(onStatus?: AIONWebGPUOptions['onStatus']): Promise<WebWorkerMLCEngine> {
  if (!canUseAIONWebGPU()) {
    throw new Error('AION requires WebGPU in a secure browser window. Use a current Safari, Chrome, or Edge browser on a device with sufficient memory.');
  }
  if (onStatus) progressListeners.add(onStatus);
  try {
    if (!enginePromise) {
      onStatus?.('Downloading AION for private on-device use. The first load is several gigabytes; later loads use the browser cache.', 0);
      worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' });
      enginePromise = CreateWebWorkerMLCEngine(worker, AION_WEBGPU_MODEL, {
        initProgressCallback: reportProgress,
        logLevel: 'WARN',
      }, {
        // Safari has a substantially lower per-page GPU/process memory ceiling than
        // desktop Ollama. Keep the KV cache compact so the exact 8B model can stay
        // resident during longer answers instead of forcing a page reload.
        context_window_size: 2048,
        temperature: 0.35,
        top_p: 0.9,
      }).catch((error) => {
        resetEngine();
        throw error;
      });
    }
    return await enginePromise;
  } finally {
    if (onStatus) progressListeners.delete(onStatus);
  }
}

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  return Object.assign(new Error('AION request was cancelled.'), { name: 'AbortError' });
}

async function loadWithAbort(
  signal?: AbortSignal,
  onStatus?: AIONWebGPUOptions['onStatus'],
): Promise<WebWorkerMLCEngine> {
  if (!signal) return loadEngine(onStatus);
  if (signal.aborted) throw abortError(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      resetEngine();
      reject(abortError(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    loadEngine(onStatus).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function cleanWebGPUAnswer(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

export async function askAIONWebGPU(
  prompt: string,
  options: AIONWebGPUOptions = {},
): Promise<string> {
  if (generationActive) throw new Error('AION is already answering another request on this device.');
  await navigator.storage?.persist?.().catch(() => false);
  const engine = await loadWithAbort(options.signal, options.onStatus);
  if (options.signal?.aborted) throw abortError(options.signal);
  generationActive = true;
  const interrupt = () => engine.interruptGenerate();
  options.signal?.addEventListener('abort', interrupt, { once: true });
  let answer = '';
  let continuationPrompt = prompt;
  try {
    for (let segment = 0; segment < 4; segment += 1) {
      let finishReason: string | null | undefined;
      options.onStatus?.(segment === 0 ? 'AION is working through the mathematics on this device…' : 'AION is completing the remaining steps…', 100);
      const stream = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: AION_SYSTEM_PROMPT },
          { role: 'user', content: continuationPrompt },
        ],
        stream: true,
        temperature: options.temperature ?? 0.35,
        top_p: 0.9,
        max_tokens: options.json ? 512 : 1_024,
        ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
        extra_body: { enable_thinking: false },
      });
      for await (const chunk of stream) {
        if (options.signal?.aborted) throw abortError(options.signal);
        const choice = chunk.choices[0];
        finishReason = choice?.finish_reason ?? finishReason;
        answer += choice?.delta?.content ?? '';
        const visible = cleanWebGPUAnswer(answer);
        if (visible) options.onUpdate?.(visible);
      }
      if (finishReason !== 'length') break;
      continuationPrompt = [
        'Continue the following AION answer exactly where it stopped.',
        'Do not repeat earlier material. Finish the remaining derivation, verification, and final result.',
        '',
        cleanWebGPUAnswer(answer),
      ].join('\n');
    }
  } finally {
    options.signal?.removeEventListener('abort', interrupt);
    generationActive = false;
  }
  const visible = cleanWebGPUAnswer(answer);
  if (!visible) throw new Error('AION returned an empty response.');
  return visible;
}
