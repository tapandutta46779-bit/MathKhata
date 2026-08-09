/// <reference lib="webworker" />

import {
  env,
  pipeline,
} from '@huggingface/transformers';
import {
  AION_BROWSER_FALLBACK_MODEL,
  type AIONWorkerRequest,
  type AIONWorkerResponse,
} from './runtime';

const workerScope = self as DedicatedWorkerGlobalScope;
type TextGenerator = Awaited<ReturnType<typeof pipeline<'text-generation'>>>;
let generator: TextGenerator | null = null;
let loading: Promise<TextGenerator> | null = null;
let device: 'webgpu' | 'wasm' = 'wasm';

function send(message: AIONWorkerResponse) {
  workerScope.postMessage(message);
}

function progressMessage(event: unknown): { progress?: number; message: string } {
  if (!event || typeof event !== 'object') return { message: 'Preparing the local runtime…' };
  const record = event as Record<string, unknown>;
  const rawProgress = typeof record.progress === 'number' ? record.progress : undefined;
  const progress = rawProgress === undefined
    ? undefined
    : Math.round((rawProgress <= 1 ? rawProgress * 100 : rawProgress) * 10) / 10;
  const file = typeof record.file === 'string' ? record.file.split('/').at(-1) : undefined;
  const status = typeof record.status === 'string' ? record.status : 'Loading';
  return { progress, message: file ? `${status}: ${file}` : status };
}

async function loadRuntime(): Promise<TextGenerator> {
  if (generator) return generator;
  if (loading) return loading;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  device = (navigator as Navigator & { gpu?: unknown }).gpu ? 'webgpu' : 'wasm';
  loading = pipeline('text-generation', AION_BROWSER_FALLBACK_MODEL, {
    device,
    dtype: device === 'webgpu' ? 'q4f16' : 'q4',
    progress_callback: (event) => send({ type: 'progress', ...progressMessage(event) }),
  });
  try {
    generator = await loading;
    send({ type: 'ready', device });
    return generator;
  } finally {
    loading = null;
  }
}

function extractAnswer(output: unknown): string {
  if (!Array.isArray(output)) return '';
  const first = output[0] as { generated_text?: unknown } | undefined;
  if (!first) return '';
  if (typeof first.generated_text === 'string') return first.generated_text.trim();
  if (!Array.isArray(first.generated_text)) return '';
  const last = first.generated_text.at(-1) as { content?: unknown } | undefined;
  return typeof last?.content === 'string' ? last.content.trim() : '';
}

workerScope.addEventListener('message', (event: MessageEvent<AIONWorkerRequest>) => {
  void (async () => {
    try {
      if (event.data.type === 'load') {
        await loadRuntime();
        return;
      }
      const localGenerator = await loadRuntime();
      const output = await localGenerator(
        [
          { role: 'system', content: 'You are AION, a careful private mathematical notebook assistant.' },
          { role: 'user', content: event.data.prompt },
        ],
        { max_new_tokens: 320, do_sample: false },
      );
      const text = extractAnswer(output);
      if (!text) throw new Error('AION returned an empty analysis.');
      send({ type: 'result', text });
    } catch (error) {
      send({
        type: 'error',
        message: error instanceof Error ? error.message : 'The local AION runtime could not finish.',
      });
    }
  })();
});
