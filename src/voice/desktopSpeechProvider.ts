import type { SpeechProvider, SpeechProviderCallbacks } from './types';

const OUTPUT_SAMPLE_RATE = 16_000;
const INTERIM_INTERVAL_MS = 4_000;
const MINIMUM_AUDIO_SECONDS = 0.45;

export function downsampleAudio(
  chunks: readonly Float32Array[],
  inputSampleRate: number,
  outputSampleRate = OUTPUT_SAMPLE_RATE,
): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const source = new Float32Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    source.set(chunk, offset);
    offset += chunk.length;
  });
  if (!source.length || inputSampleRate <= outputSampleRate) return source;
  const ratio = inputSampleRate / outputSampleRate;
  const result = new Float32Array(Math.floor(source.length / ratio));
  for (let index = 0; index < result.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(source.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += source[sourceIndex];
    result[index] = sum / (end - start);
  }
  return result;
}

export function hasAudibleSpeech(audio: Float32Array): boolean {
  if (audio.length < OUTPUT_SAMPLE_RATE * MINIMUM_AUDIO_SECONDS) return false;
  let energy = 0;
  for (let index = 0; index < audio.length; index += 1) energy += audio[index] * audio[index];
  return Math.sqrt(energy / audio.length) >= 0.004;
}

interface DesktopWorkerMessage {
  type: 'status' | 'transcript' | 'error';
  message?: string;
  sessionId?: string;
  requestId?: number;
  final?: boolean;
  text?: string;
}

export class DesktopSpeechProvider implements SpeechProvider {
  readonly id = 'aion-local-speech';
  readonly supported = typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof Worker !== 'undefined'
    && typeof AudioContext !== 'undefined';

  private callbacks: SpeechProviderCallbacks | null = null;
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private inputSampleRate = OUTPUT_SAMPLE_RATE;
  private interval: number | null = null;
  private sessionId = '';
  private requestId = 0;
  private inFlight = false;
  private finalRequested = false;

  start(callbacks: SpeechProviderCallbacks): void {
    if (!this.supported) {
      callbacks.onState('unsupported');
      callbacks.onError('Private desktop speech recognition is not available on this device.');
      return;
    }
    this.cancel();
    this.callbacks = callbacks;
    this.sessionId = crypto.randomUUID();
    this.requestId = 0;
    this.chunks = [];
    this.finalRequested = false;
    callbacks.onState('requesting-microphone');
    void this.beginCapture();
  }

  private async beginCapture() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (!this.callbacks) {
        this.stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.context = new AudioContext();
      await this.context.resume();
      this.inputSampleRate = this.context.sampleRate;
      this.source = this.context.createMediaStreamSource(this.stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.silentGain = this.context.createGain();
      this.silentGain.gain.value = 0;
      this.processor.onaudioprocess = (event) => {
        if (!this.callbacks) return;
        this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      this.source.connect(this.processor);
      this.processor.connect(this.silentGain);
      this.silentGain.connect(this.context.destination);
      this.worker = new Worker(new URL('./desktopSpeech.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<DesktopWorkerMessage>) => this.handleWorkerMessage(event.data);
      this.worker.onerror = () => this.fail('Private speech recognition could not start. Check your connection once so its local model can be prepared.');
      this.interval = window.setInterval(() => this.requestTranscript(false), INTERIM_INTERVAL_MS);
      this.callbacks.onStatus?.('Audio stays on this Mac. The recognition model is prepared locally on first use.');
      this.callbacks.onState('listening');
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.fail(denied
        ? 'Microphone access was denied. Enable Math Notebook in System Settings › Privacy & Security › Microphone, then try again.'
        : `Microphone could not start: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private audioSnapshot(): Float32Array {
    return downsampleAudio(this.chunks, this.inputSampleRate);
  }

  private requestTranscript(final: boolean) {
    if (!this.worker || this.inFlight || !this.callbacks) return;
    const audio = this.audioSnapshot();
    if (!hasAudibleSpeech(audio)) {
      if (final) this.fail('No clear speech was detected. Nothing was inserted; try again closer to the microphone.');
      return;
    }
    this.inFlight = true;
    const requestId = ++this.requestId;
    const buffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
    this.worker.postMessage({ type: 'transcribe', sessionId: this.sessionId, requestId, final, audio: buffer }, [buffer]);
  }

  private handleWorkerMessage(message: DesktopWorkerMessage) {
    if (!this.callbacks) return;
    if (message.type === 'status') {
      if (message.message) this.callbacks.onStatus?.(message.message);
      return;
    }
    if (message.sessionId !== this.sessionId || message.requestId !== this.requestId) return;
    if (message.type === 'error') {
      this.fail(`Private speech recognition failed: ${message.message || 'unknown error'}`);
      return;
    }
    this.inFlight = false;
    const text = message.text?.trim() ?? '';
    if (text) {
      this.callbacks.onTranscript({ text, isFinal: Boolean(message.final), recognitionTimestamp: performance.now() });
    }
    if (message.final) {
      if (!text) {
        this.fail('No speech could be recognized. Nothing was inserted.');
        return;
      }
      this.callbacks.onState('finished');
      const callbacks = this.callbacks;
      this.cleanupCapture();
      this.callbacks = null;
      callbacks.onEnd();
    } else if (this.finalRequested) {
      this.requestTranscript(true);
    } else if (text) {
      this.callbacks.onState('interim-transcript');
    }
  }

  stop(): void {
    if (!this.callbacks) return;
    this.finalRequested = true;
    this.callbacks.onState('finalizing');
    this.stopCaptureInput();
    if (!this.inFlight) this.requestTranscript(true);
  }

  cancel(): void {
    this.sessionId = '';
    this.callbacks = null;
    this.cleanupCapture();
  }

  private fail(message: string) {
    if (!this.callbacks) return;
    const callbacks = this.callbacks;
    callbacks.onState('error');
    callbacks.onError(message);
    this.cleanupCapture();
    this.callbacks = null;
    callbacks.onEnd();
  }

  private stopCaptureInput() {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.interval = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => track.stop());
  }

  private cleanupCapture() {
    this.stopCaptureInput();
    if (this.processor) this.processor.onaudioprocess = null;
    void this.context?.close().catch(() => undefined);
    this.worker?.terminate();
    this.worker = null;
    this.context = null;
    this.source = null;
    this.processor = null;
    this.silentGain = null;
    this.inFlight = false;
    this.finalRequested = false;
  }
}
