import type { FlowObjectInput } from './writingFlow';

export type LineIntentMode = 'auto' | 'text' | 'math';
export type DetectedLineIntent = 'text' | 'math' | 'mixed';

const EXPLICIT_INLINE_MATH = /(\$[^$]+\$|\\\([^)]*\\\))/g;
const EQUATION_SPAN = /(?:^|\s)([a-zA-Z](?:_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+|\^\{[^}]+\})?(?:\s*[+\-*/×÷]\s*(?:[a-zA-Z0-9]|\\[a-zA-Z]+|\([^)]*\)))+\s*(?:=|≤|≥|<|>|\\(?:leq?|geq?|ne|approx))\s*[^,.;]+)/;
const SIMPLE_RELATION = /(?:^|\s)([a-zA-Z](?:_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+|\^\{[^}]+\})?\s*(?:=|≤|≥|<|>|\\(?:leq?|geq?|ne|approx))\s*(?:-?\d+(?:\.\d+)?|[a-zA-Z](?:_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+)?))/;

export function normalizeTypedMath(source: string): string {
  return source
    .trim()
    .replace(/^\$|\$$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .replaceAll('×', '\\times ')
    .replaceAll('÷', '\\div ')
    .replaceAll('≤', '\\le ')
    .replaceAll('≥', '\\ge ')
    .replaceAll('≠', '\\ne ')
    .replaceAll('π', '\\pi ')
    .replaceAll('∞', '\\infty ')
    .replaceAll('√', '\\sqrt ');
}

function looksLikeWholeMath(source: string): boolean {
  const clean = source.trim();
  if (!clean) return false;
  if (/^(?:\\|∫|∬|∭|∮|Σ|Π|∂|∇|\d)/.test(clean)) return true;
  if (/[=<>≤≥≠^_]|\\(?:frac|sqrt|int|iint|iiint|oint|sum|prod|det|sin|cos|tan|log|ln|partial|nabla|begin)\b/.test(clean)) {
    const proseWords = clean.match(/\b[a-zA-Z]{3,}\b/g)?.length ?? 0;
    const mathTokens = clean.match(/[=<>≤≥≠+\-*/^_]|\\[a-zA-Z]+|\d+(?:\.\d+)?|\b[a-zA-Z]\b/g)?.length ?? 0;
    return mathTokens >= Math.max(1, proseWords);
  }
  return /^-?(?:\d+(?:\.\d+)?|[a-zA-Z])(?:\s*[+\-*/×÷]\s*-?(?:\d+(?:\.\d+)?|[a-zA-Z]))+$/.test(clean);
}

function splitExplicitMath(source: string): FlowObjectInput[] | null {
  const matches = [...source.matchAll(EXPLICIT_INLINE_MATH)];
  if (matches.length === 0) return null;
  const items: FlowObjectInput[] = [];
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? cursor;
    const before = source.slice(cursor, index).trim();
    if (before) items.push({ type: 'text', content: before });
    items.push({ type: 'math', content: normalizeTypedMath(match[0]) });
    cursor = index + match[0].length;
  }
  const after = source.slice(cursor).trim();
  if (after) items.push({ type: 'text', content: after });
  return items;
}

function splitDetectedRelation(source: string): FlowObjectInput[] | null {
  const match = source.match(EQUATION_SPAN) ?? source.match(SIMPLE_RELATION);
  if (!match || match.index === undefined) return null;
  const relation = match[1].trim();
  const relationOffset = match[0].indexOf(match[1]);
  const start = match.index + relationOffset;
  const end = start + relation.length;
  const before = source.slice(0, start).trim();
  const after = source.slice(end).trim();
  if (!before && !after) return null;
  return [
    ...(before ? [{ type: 'text' as const, content: before }] : []),
    { type: 'math' as const, content: normalizeTypedMath(relation) },
    ...(after ? [{ type: 'text' as const, content: after }] : []),
  ];
}

export function interpretTypedLine(source: string, mode: LineIntentMode = 'auto'): {
  intent: DetectedLineIntent;
  items: FlowObjectInput[];
} {
  const clean = source.trim();
  if (!clean) return { intent: mode === 'math' ? 'math' : 'text', items: [] };
  if (mode === 'text') return { intent: 'text', items: [{ type: 'text', content: clean }] };
  if (mode === 'math') {
    return { intent: 'math', items: [{ type: 'math', content: normalizeTypedMath(clean) }] };
  }
  const explicit = splitExplicitMath(clean);
  if (explicit) return { intent: explicit.length > 1 ? 'mixed' : explicit[0].type, items: explicit };
  const detectedRelation = splitDetectedRelation(clean);
  if (detectedRelation) return { intent: 'mixed', items: detectedRelation };
  if (looksLikeWholeMath(clean)) {
    return { intent: 'math', items: [{ type: 'math', content: normalizeTypedMath(clean) }] };
  }
  return { intent: 'text', items: [{ type: 'text', content: clean }] };
}
