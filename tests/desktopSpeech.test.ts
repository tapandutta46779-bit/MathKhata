import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopSpeechProvider, downsampleAudio, hasAudibleSpeech } from '../src/voice/desktopSpeechProvider';

const originalAudioContext = globalThis.AudioContext;
const originalWorker = globalThis.Worker;
const originalMediaDevices = navigator.mediaDevices;

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: originalAudioContext });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: originalWorker });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices });
});

describe('private desktop speech provider', () => {
  it('downsamples captured PCM and rejects silence instead of fabricating text', () => {
    const source = new Float32Array(48_000).fill(0.08);
    const sampled = downsampleAudio([source], 48_000);
    expect(sampled).toHaveLength(16_000);
    expect(sampled[100]).toBeCloseTo(0.08);
    expect(hasAudibleSpeech(new Float32Array(16_000))).toBe(false);
    expect(hasAudibleSpeech(sampled)).toBe(true);
  });

  it('reports denied microphone access honestly and emits no transcript', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class {} });
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {} });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) },
    });
    const provider = new DesktopSpeechProvider();
    const states: string[] = [];
    const errors: string[] = [];
    const transcripts: string[] = [];
    provider.start({
      onState: (state) => states.push(state),
      onTranscript: (transcript) => transcripts.push(transcript.text),
      onError: (error) => errors.push(error),
      onEnd: vi.fn(),
    });
    await vi.waitFor(() => expect(errors).toHaveLength(1));

    expect(states).toEqual(['requesting-microphone', 'error']);
    expect(errors[0]).toContain('System Settings');
    expect(transcripts).toEqual([]);
  });

  it('emits real interim and final transcripts, stops microphone tracks, and can start again', async () => {
    vi.useFakeTimers();
    let processor: { onaudioprocess: ((event: { inputBuffer: { getChannelData(): Float32Array } }) => void) | null; connect(): void; disconnect(): void };
    const stopTrack = vi.fn();
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(message: { sessionId: string; requestId: number; final: boolean }) {
        queueMicrotask(() => this.onmessage?.({ data: {
          type: 'transcript',
          sessionId: message.sessionId,
          requestId: message.requestId,
          final: message.final,
          text: message.final ? 'x equals six' : 'x equals',
        } } as MessageEvent));
      }
      terminate() {}
    }
    class FakeAudioContext {
      sampleRate = 16_000;
      destination = {};
      async resume() {}
      async close() {}
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() {
        processor = { onaudioprocess: null, connect() {}, disconnect() {} };
        return processor;
      }
      createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    }
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext });
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
    });
    const provider = new DesktopSpeechProvider();
    const states: string[] = [];
    const transcripts: Array<{ text: string; final: boolean }> = [];
    const ended = vi.fn();
    const callbacks = {
      onState: (state: Parameters<NonNullable<Parameters<typeof provider.start>[0]['onState']>>[0]) => states.push(state),
      onTranscript: (transcript: { text: string; isFinal: boolean }) => transcripts.push({ text: transcript.text, final: transcript.isFinal }),
      onError: vi.fn(),
      onEnd: ended,
    };

    provider.start(callbacks);
    await Promise.resolve();
    await Promise.resolve();
    processor!.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(16_000).fill(0.08) } });
    await vi.advanceTimersByTimeAsync(4_000);
    provider.stop();
    await Promise.resolve();

    expect(transcripts).toEqual([
      { text: 'x equals', final: false },
      { text: 'x equals six', final: true },
    ]);
    expect(states).toEqual(expect.arrayContaining(['listening', 'interim-transcript', 'finalizing', 'finished']));
    expect(stopTrack).toHaveBeenCalled();
    expect(ended).toHaveBeenCalledOnce();

    provider.start(callbacks);
    await Promise.resolve();
    await Promise.resolve();
    provider.cancel();
    expect(stopTrack).toHaveBeenCalledTimes(2);
  });
});
