export type VoiceState =
  | 'idle'
  | 'requesting-microphone'
  | 'listening'
  | 'interim-transcript'
  | 'finalizing'
  | 'finished'
  | 'error'
  | 'unsupported';

export interface SpeechTranscript {
  text: string;
  isFinal: boolean;
  recognitionTimestamp: number;
}

export interface VoiceLatency {
  recognitionTimestamp: number;
  parserStartTimestamp: number;
  parserFinishTimestamp: number;
  renderTimestamp?: number;
  recognitionToCandidateMs: number;
  candidateToRenderMs?: number;
  totalVisibleLatencyMs?: number;
}

export interface MathCandidate {
  transcript: string;
  latex: string;
  confidence: number;
  ambiguities: string[];
  unknownTokens: string[];
  isFinal: boolean;
  latency: VoiceLatency;
}

export interface VoiceCandidateSegment {
  kind: 'math' | 'text';
  sourceText: string;
  latex?: string;
  text?: string;
  confidence: number;
  ambiguities: string[];
  unknownTokens: string[];
}

export interface NotebookVoiceCandidate {
  transcript: string;
  segments: VoiceCandidateSegment[];
  confidence: number;
  ambiguities: string[];
  unknownTokens: string[];
  isFinal: boolean;
  latency: VoiceLatency;
}

export interface SpeechProviderCallbacks {
  onState: (state: VoiceState) => void;
  onTranscript: (transcript: SpeechTranscript) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export interface SpeechProvider {
  readonly id: string;
  readonly supported: boolean;
  start(callbacks: SpeechProviderCallbacks): void;
  stop(): void;
  cancel(): void;
}

export interface VoiceInsertionController {
  accept(candidate: NotebookVoiceCandidate): string[];
  cancel(): void;
}
