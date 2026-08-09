/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers';

const scope = self as DedicatedWorkerGlobalScope;
const LOCAL_SPEECH_MODEL = 'onnx-community/whisper-small';
type Transcriber = Awaited<ReturnType<typeof pipeline<'automatic-speech-recognition'>>>;

let transcriber: Transcriber | null = null;
let loading: Promise<Transcriber> | null = null;

function send(message: Record<string, unknown>) {
  scope.postMessage(message);
}

function progressMessage(event: unknown): string {
  if (!event || typeof event !== 'object') return 'Preparing private speech recognition…';
  const record = event as Record<string, unknown>;
  const file = typeof record.file === 'string' ? record.file.split('/').at(-1) : '';
  const status = typeof record.status === 'string' ? record.status : 'Preparing';
  const value = typeof record.progress === 'number'
    ? Math.round((record.progress <= 1 ? record.progress * 100 : record.progress))
    : undefined;
  return `${status}${file ? ` ${file}` : ''}${value === undefined ? '' : ` · ${value}%`}`;
}

async function loadTranscriber(): Promise<Transcriber> {
  if (transcriber) return transcriber;
  if (loading) return loading;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  const device = (navigator as Navigator & { gpu?: unknown }).gpu ? 'webgpu' : 'wasm';
  loading = pipeline('automatic-speech-recognition', LOCAL_SPEECH_MODEL, {
    device,
    dtype: 'q4',
    progress_callback: (event) => send({ type: 'status', message: progressMessage(event) }),
  });
  try {
    transcriber = await loading;
    send({ type: 'status', message: 'Private speech recognition is ready.' });
    return transcriber;
  } finally {
    loading = null;
  }
}

function outputText(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const text = (output as { text?: unknown }).text;
  return typeof text === 'string' ? text.trim() : '';
}

scope.addEventListener('message', (event: MessageEvent<{
  type: 'transcribe';
  sessionId: string;
  requestId: number;
  final: boolean;
  audio: ArrayBuffer;
}>) => {
  if (event.data.type !== 'transcribe') return;
  void (async () => {
    const { sessionId, requestId, final, audio } = event.data;
    try {
      const localTranscriber = await loadTranscriber();
      const output = await localTranscriber(new Float32Array(audio), {
        language: 'en',
        task: 'transcribe',
        chunk_length_s: 25,
        stride_length_s: 4,
      });
      send({ type: 'transcript', sessionId, requestId, final, text: outputText(output) });
    } catch (error) {
      send({
        type: 'error',
        sessionId,
        requestId,
        message: error instanceof Error ? error.message : 'Private speech recognition could not finish.',
      });
    }
  })();
});
