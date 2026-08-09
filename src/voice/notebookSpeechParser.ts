import { isKnownMathVoicePhrase, parseMathSpeech } from './mathSpeechParser';
import type {
  NotebookVoiceCandidate,
  VoiceCandidateSegment,
} from './types';

const NOTEBOOK_BREAK = /\s*(?:\bnext line\b|\bnew line\b|\bafter that\b|\bthen\b|[;\n]+)\s*/gi;
const RELATION_SIGNAL = /(?:[=<>≤≥≠∈∉⊂⊆≈∝∥⊥]|\b(?:equal|equals|less than|greater than|element of|subset|implies|equivalent|approximately|proportional|parallel|perpendicular|if and only if)\b)/i;
const OPERATOR_SIGNAL = /(?:[+\-−×÷*/^√∫∬∭∮∑∏∞∇∂]|\b(?:plus|minus|times|into|divided by|over|square|squared|cubed|power|root|integral|integration|sum|summation|product|derivative|partial|limit|matrix|vector|determinant|union|intersection|gradient|laplacian|floor|ceiling|norm|factorial|angle|cases|evaluate|absolute|empty set|for all|there exists)\b|\bd\s+[a-z]\b)/i;
const FUNCTION_OR_SYMBOL_SIGNAL = /\b(?:sin|sine|cos|cosine|tan|tangent|secant|cosecant|cotangent|log|logarithm|exponential|infinity|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|phi|psi|omega)\b/i;

function clock(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function splitNotebookSpeech(transcript: string): string[] {
  return transcript
    .split(NOTEBOOK_BREAK)
    .map((part) => part.trim().replace(/^[,.:]+|[,.:]+$/g, '').trim())
    .filter(Boolean);
}

function shouldBeMath(sourceText: string, unknownTokens: string[]): boolean {
  const compact = sourceText.trim();
  if (isKnownMathVoicePhrase(compact)) return true;
  if (/^(?:[a-z]|\d+(?:\.\d+)?)$/i.test(compact)) return true;
  const hasRelation = RELATION_SIGNAL.test(compact);
  const hasMathSignal = hasRelation || OPERATOR_SIGNAL.test(compact) || FUNCTION_OR_SYMBOL_SIGNAL.test(compact);
  if (!hasMathSignal) return false;

  const wordCount = compact.match(/[a-z]+|\d+(?:\.\d+)?/gi)?.length ?? 1;
  const unknownRatio = unknownTokens.length / Math.max(1, wordCount);
  if (hasRelation) return unknownRatio <= 0.45;
  return unknownRatio <= 0.34;
}

function parseSegment(sourceText: string, recognitionTimestamp: number, isFinal: boolean): VoiceCandidateSegment {
  const math = parseMathSpeech(sourceText, recognitionTimestamp, isFinal);
  if (!shouldBeMath(sourceText, math.unknownTokens)) {
    return {
      kind: 'text',
      sourceText,
      text: sourceText,
      confidence: 0.9,
      ambiguities: [],
      unknownTokens: [],
    };
  }
  return {
    kind: 'math',
    sourceText,
    latex: math.latex,
    confidence: math.confidence,
    ambiguities: math.ambiguities,
    unknownTokens: math.unknownTokens,
  };
}

export function parseNotebookSpeech(
  transcript: string,
  recognitionTimestamp = clock(),
  isFinal = true,
): NotebookVoiceCandidate {
  const parserStartTimestamp = clock();
  const segments = splitNotebookSpeech(transcript).map((part) =>
    parseSegment(part, recognitionTimestamp, isFinal),
  );
  const parserFinishTimestamp = clock();
  const ambiguities = segments.flatMap((segment) => segment.ambiguities);
  const unknownTokens = [...new Set(segments.flatMap((segment) => segment.unknownTokens))];
  const confidence = segments.length
    ? segments.reduce((total, segment) => total + segment.confidence, 0) / segments.length
    : 0;
  return {
    transcript,
    segments,
    confidence,
    ambiguities,
    unknownTokens,
    isFinal,
    latency: {
      recognitionTimestamp,
      parserStartTimestamp,
      parserFinishTimestamp,
      recognitionToCandidateMs: Math.max(0, parserFinishTimestamp - recognitionTimestamp),
    },
  };
}

export function markNotebookCandidateRendered(
  candidate: NotebookVoiceCandidate,
  renderTimestamp = clock(),
): NotebookVoiceCandidate {
  return {
    ...candidate,
    latency: {
      ...candidate.latency,
      renderTimestamp,
      candidateToRenderMs: Math.max(0, renderTimestamp - candidate.latency.parserFinishTimestamp),
      totalVisibleLatencyMs: Math.max(0, renderTimestamp - candidate.latency.recognitionTimestamp),
    },
  };
}
