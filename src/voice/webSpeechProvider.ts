import type {
  SpeechProvider,
  SpeechProviderCallbacks,
  SpeechTranscript,
} from './types';

interface RecognitionAlternativeLike {
  transcript: string;
}

interface RecognitionResultLike {
  isFinal: boolean;
  0: RecognitionAlternativeLike;
}

interface RecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionErrorEventLike extends Event {
  error?: string;
  message?: string;
}

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

function clock(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function getConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export class WebSpeechProvider implements SpeechProvider {
  readonly id = 'chrome-web-speech';
  readonly supported = getConstructor() !== null;
  private recognition: RecognitionLike | null = null;

  start(callbacks: SpeechProviderCallbacks): void {
    const Recognition = getConstructor();
    if (!Recognition) {
      callbacks.onState('unsupported');
      callbacks.onError('This browser does not expose Web Speech recognition.');
      return;
    }

    this.cancel();
    callbacks.onState('requesting-microphone');
    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.onstart = () => callbacks.onState('listening');
    recognition.onresult = (event) => {
      let interim = '';
      const finals: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim();
        if (!text) continue;
        if (result.isFinal) finals.push(text);
        else interim += `${text} `;
      }
      const timestamp = clock();
      const transcript: SpeechTranscript | null = finals.length
        ? { text: finals.join(' '), isFinal: true, recognitionTimestamp: timestamp }
        : interim.trim()
          ? { text: interim.trim(), isFinal: false, recognitionTimestamp: timestamp }
          : null;
      if (transcript) {
        callbacks.onState(transcript.isFinal ? 'finalizing' : 'interim-transcript');
        callbacks.onTranscript(transcript);
        if (transcript.isFinal) callbacks.onState('finished');
      }
    };
    recognition.onerror = (event) => {
      const code = event.error ?? event.message ?? 'unknown recognition error';
      callbacks.onState(code === 'not-allowed' || code === 'service-not-allowed' ? 'error' : 'error');
      callbacks.onError(`Speech recognition error: ${code}`);
    };
    recognition.onend = () => {
      this.recognition = null;
      callbacks.onEnd();
    };

    try {
      recognition.start();
    } catch (error) {
      this.recognition = null;
      callbacks.onState('error');
      callbacks.onError(
        `Speech recognition could not start: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  stop(): void {
    this.recognition?.stop();
  }

  cancel(): void {
    if (!this.recognition) return;
    const recognition = this.recognition;
    this.recognition = null;
    recognition.onend = null;
    recognition.abort();
  }
}

