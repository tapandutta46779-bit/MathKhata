import type {
  SpeechProvider,
  SpeechProviderCallbacks,
  SpeechTranscript,
} from './types';
import { MATH_PALETTE_CATEGORIES } from '../domain/mathNotation';

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
  maxAlternatives?: number;
  phrases?: RecognitionPhraseLike[];
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;
interface RecognitionPhraseLike {
  readonly phrase: string;
  readonly boost: number;
}
type RecognitionPhraseConstructor = new (phrase: string, boost?: number) => RecognitionPhraseLike;

const CONTEXT_PHRASES = [
  'then',
  'next line',
  'new line',
  'equals',
  'is equal to',
  'squared',
  'square root',
  'into',
  'integral',
  'summation',
  'theta',
  'lambda',
  'phi',
  'psi',
];

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

function addContextualBias(recognition: RecognitionLike): boolean {
  if (typeof window === 'undefined' || !('phrases' in recognition)) return false;
  const Phrase = (window as typeof window & {
    SpeechRecognitionPhrase?: RecognitionPhraseConstructor;
  }).SpeechRecognitionPhrase;
  if (!Phrase) return false;
  const catalogPhrases = MATH_PALETTE_CATEGORIES.flatMap((category) =>
    category.items.map((item) => item.voice.phrase),
  );
  const uniquePhrases = [...new Set([...CONTEXT_PHRASES, ...catalogPhrases])];
  try {
    recognition.phrases = uniquePhrases.map(
      (phrase) => new Phrase(phrase, CONTEXT_PHRASES.includes(phrase) ? 4 : 2.2),
    );
    return true;
  } catch {
    // Contextual biasing is experimental. Recognition remains usable without it.
    return false;
  }
}

export class WebSpeechProvider implements SpeechProvider {
  readonly id = 'chrome-web-speech';
  readonly supported = getConstructor() !== null;
  private recognition: RecognitionLike | null = null;
  private finalSegments: string[] = [];

  start(callbacks: SpeechProviderCallbacks): void {
    const Recognition = getConstructor();
    if (!Recognition) {
      callbacks.onState('unsupported');
      callbacks.onError('This browser does not expose Web Speech recognition.');
      return;
    }

    this.cancel();
    this.finalSegments = [];
    const beginRecognition = (useContextualBias: boolean) => {
      callbacks.onState('requesting-microphone');
      const recognition = new Recognition();
      this.recognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';
      recognition.maxAlternatives = 3;
      const biasedRecognition = useContextualBias && addContextualBias(recognition);
      let restartWithoutPhrases = false;
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
        this.finalSegments.push(...finals);
        const timestamp = clock();
        const combinedText = [...this.finalSegments, interim.trim()].filter(Boolean).join(' ');
        const transcript: SpeechTranscript | null = combinedText
          ? { text: combinedText, isFinal: finals.length > 0 && !interim.trim(), recognitionTimestamp: timestamp }
            : null;
        if (transcript) {
          callbacks.onState(transcript.isFinal ? 'finalizing' : 'interim-transcript');
          callbacks.onTranscript(transcript);
          if (transcript.isFinal) callbacks.onState('finished');
        }
      };
      recognition.onerror = (event) => {
        const code = event.error ?? event.message ?? 'unknown recognition error';
        if (code === 'phrases-not-supported' && biasedRecognition) {
          restartWithoutPhrases = true;
          callbacks.onState('requesting-microphone');
          return;
        }
        callbacks.onState('error');
        callbacks.onError(`Speech recognition error: ${code}`);
      };
      recognition.onend = () => {
        if (restartWithoutPhrases && this.recognition === recognition) {
          this.recognition = null;
          beginRecognition(false);
          return;
        }
        this.recognition = null;
        callbacks.onEnd();
      };

      try {
        recognition.start();
      } catch (error) {
        this.recognition = null;
        if (biasedRecognition) {
          beginRecognition(false);
          return;
        }
        callbacks.onState('error');
        callbacks.onError(
          `Speech recognition could not start: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    };

    beginRecognition(true);
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
