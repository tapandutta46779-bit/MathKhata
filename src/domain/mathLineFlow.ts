const AUTO_MULTILINE_START = '\\begin{multline}';
const AUTO_MULTILINE_END = '\\end{multline}';

// The calculation rail occupies the right notebook margin when an expression
// is eligible for evaluation. Wrap before that quiet rail so MathLive's menu
// and keyboard toggles never cover the final terms of a handwritten line.
export const DEFAULT_MATH_LINE_UNITS = 38;
export const MAX_AUTOMATIC_MATH_LINES = 8;

export interface MathLineLayout {
  latex: string;
  lineCount: number;
  automatic: boolean;
}

function commandLength(source: string, index: number): number {
  const match = source.slice(index).match(/^\\[a-zA-Z]+|^\\./);
  return match?.[0].length ?? 1;
}

export function estimateMathWidthUnits(latex: string): number {
  let units = 0;
  for (let index = 0; index < latex.length;) {
    const character = latex[index];
    if (character === '\\') {
      const length = commandLength(latex, index);
      const command = latex.slice(index, index + length);
      if (/^\\(?:frac|dfrac|tfrac)$/.test(command)) units += 3.2;
      else if (/^\\(?:int|iint|iiint|oint|sum|prod|lim)$/.test(command)) units += 2.4;
      else if (/^\\(?:left|right|,|!|;|:)$/.test(command)) units += 0.15;
      else units += 1.35;
      index += length;
      continue;
    }
    if (character === '{' || character === '}') {
      index += 1;
      continue;
    }
    if (/\s/.test(character)) units += 0.25;
    else if (/[=+\-<>]/.test(character)) units += 1.25;
    else units += 1;
    index += 1;
  }
  return units;
}

function topLevelBreakpoints(latex: string): number[] {
  const points: number[] = [];
  let braceDepth = 0;
  let environmentDepth = 0;
  for (let index = 0; index < latex.length;) {
    if (latex.startsWith('\\begin{', index)) {
      environmentDepth += 1;
      index += 7;
      continue;
    }
    if (latex.startsWith('\\end{', index)) {
      environmentDepth = Math.max(0, environmentDepth - 1);
      index += 5;
      continue;
    }
    const character = latex[index];
    if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (braceDepth === 0 && environmentDepth === 0) {
      if (/[=+<>]/.test(character) || (character === '-' && index > 0)) points.push(index);
      if (character === '\\') {
        const command = latex.slice(index).match(/^\\(?:pm|mp|leq?|geq?|ne|approx|sim|propto|Rightarrow|Leftarrow|Leftrightarrow|implies|iff)\b/);
        if (command) points.push(index);
      }
    }
    index += character === '\\' ? commandLength(latex, index) : 1;
  }
  return [...new Set(points)].filter((point) => point > 0);
}

export function splitLongMathLatex(
  latex: string,
  maxUnits = DEFAULT_MATH_LINE_UNITS,
): string[] {
  const clean = latex.trim();
  if (
    !clean ||
    estimateMathWidthUnits(clean) <= maxUnits ||
    /\\begin\{|\\\\/.test(clean)
  ) return [clean];

  const breakpoints = topLevelBreakpoints(clean);
  if (breakpoints.length === 0) return [clean];
  const rows: string[] = [];
  let start = 0;
  while (
    estimateMathWidthUnits(clean.slice(start)) > maxUnits &&
    rows.length < MAX_AUTOMATIC_MATH_LINES - 1
  ) {
    const candidates = breakpoints.filter((point) => point > start);
    if (candidates.length === 0) break;
    const within = candidates.filter(
      (point) => estimateMathWidthUnits(clean.slice(start, point)) <= maxUnits,
    );
    const chosen = within.at(-1) ?? candidates[0];
    if (chosen <= start) break;
    rows.push(clean.slice(start, chosen).trimEnd());
    start = chosen;
  }
  rows.push(clean.slice(start).trimStart());
  return rows.filter(Boolean);
}

export function layoutMathOnRuledLines(
  latex: string,
  maxUnits = DEFAULT_MATH_LINE_UNITS,
): MathLineLayout {
  const rows = splitLongMathLatex(latex, maxUnits);
  if (rows.length <= 1) return { latex: rows[0] ?? '', lineCount: 1, automatic: false };
  return {
    latex: `${AUTO_MULTILINE_START}${rows.join('\\\\')}${AUTO_MULTILINE_END}`,
    lineCount: rows.length,
    automatic: true,
  };
}

export function unwrapAutomaticMathLayout(latex: string): string {
  const clean = latex.trim();
  if (!clean.startsWith(AUTO_MULTILINE_START) || !clean.endsWith(AUTO_MULTILINE_END)) {
    return latex;
  }
  const content = clean.slice(AUTO_MULTILINE_START.length, -AUTO_MULTILINE_END.length);
  let result = '';
  let environmentDepth = 0;
  for (let index = 0; index < content.length;) {
    if (content.startsWith('\\begin{', index)) {
      environmentDepth += 1;
      result += '\\begin{';
      index += 7;
      continue;
    }
    if (content.startsWith('\\end{', index)) {
      environmentDepth = Math.max(0, environmentDepth - 1);
      result += '\\end{';
      index += 5;
      continue;
    }
    if (environmentDepth === 0 && content.startsWith('\\\\', index)) {
      index += 2;
      continue;
    }
    result += content[index];
    index += 1;
  }
  return result;
}

export function automaticMathLineCount(latex: string): number {
  return splitLongMathLatex(latex).length;
}
