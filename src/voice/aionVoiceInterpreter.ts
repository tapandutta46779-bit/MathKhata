import { askAIONLocal } from '../aion/ollamaProvider';
import type { NotebookVoiceCandidate, VoiceCandidateSegment } from './types';

interface AIONVoicePayload {
  segments?: Array<{
    kind?: unknown;
    sourceText?: unknown;
    text?: unknown;
    latex?: unknown;
    confidence?: unknown;
    note?: unknown;
  }>;
}

function extractJson(text: string): AIONVoicePayload {
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  return JSON.parse(clean) as AIONVoicePayload;
}

function validateSegment(value: NonNullable<AIONVoicePayload['segments']>[number]): VoiceCandidateSegment | null {
  if (value.kind !== 'math' && value.kind !== 'text') return null;
  const sourceText = typeof value.sourceText === 'string' ? value.sourceText.trim() : '';
  const confidence = typeof value.confidence === 'number'
    ? Math.max(0, Math.min(1, value.confidence))
    : 0.78;
  const note = typeof value.note === 'string' && value.note.trim() ? [value.note.trim()] : [];
  if (value.kind === 'math') {
    const latex = typeof value.latex === 'string' ? value.latex.trim() : '';
    if (!latex) return null;
    return { kind: 'math', sourceText: sourceText || latex, latex, confidence, ambiguities: note, unknownTokens: [] };
  }
  const text = typeof value.text === 'string' ? value.text.trim() : sourceText;
  if (!text) return null;
  return { kind: 'text', sourceText: sourceText || text, text, confidence, ambiguities: note, unknownTokens: [] };
}

export async function refineVoiceCandidateWithAION(
  candidate: NotebookVoiceCandidate,
  signal?: AbortSignal,
): Promise<NotebookVoiceCandidate> {
  const prompt = [
    'Interpret the following speech transcript as a sequence of notebook lines containing ordinary text, editable mathematics, or both.',
    'Words such as "then", "next line", and "after that" separate lines and must not become mathematical variables.',
    'Unknown ordinary words stay as text; never force them into mathematics.',
    'For mathematical speech, produce standard MathLive-compatible LaTeX. Support equations, functions, derivatives, partial derivatives, limits, matrices, determinants, sums, products, roots, vectors, double/triple/contour integrals, Greek symbols, and relations.',
    'Do not solve or change the meaning. Preserve every meaningful phrase. If uncertain, keep text and add a short note.',
    'Return JSON only with this exact shape: {"segments":[{"kind":"math|text","sourceText":"...","latex":"... for math","text":"... for text","confidence":0.0,"note":"optional"}]}',
    '',
    `Transcript: ${JSON.stringify(candidate.transcript)}`,
    `Deterministic draft: ${JSON.stringify(candidate.segments.map((segment) => ({ kind: segment.kind, sourceText: segment.sourceText, latex: segment.latex, text: segment.text })))}`,
  ].join('\n');
  const answer = await askAIONLocal(prompt, { signal, json: true, temperature: 0.1 });
  const payload = extractJson(answer.text);
  const segments = payload.segments?.map(validateSegment).filter((segment): segment is VoiceCandidateSegment => Boolean(segment)) ?? [];
  if (segments.length === 0) throw new Error('Local Qwen did not return a usable voice interpretation.');
  const parserFinishTimestamp = typeof performance === 'undefined' ? Date.now() : performance.now();
  return {
    ...candidate,
    segments,
    confidence: segments.reduce((total, segment) => total + segment.confidence, 0) / segments.length,
    ambiguities: segments.flatMap((segment) => segment.ambiguities),
    unknownTokens: [],
    latency: {
      ...candidate.latency,
      parserFinishTimestamp,
      renderTimestamp: undefined,
      candidateToRenderMs: undefined,
      totalVisibleLatencyMs: undefined,
    },
  };
}
