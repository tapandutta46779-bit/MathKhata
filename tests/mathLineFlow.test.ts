import { describe, expect, it } from 'vitest';
import {
  automaticMathLineCount,
  layoutMathOnRuledLines,
  splitLongMathLatex,
  unwrapAutomaticMathLayout,
} from '../src/domain/mathLineFlow';

describe('human-style ruled math line flow', () => {
  it('keeps a short equation on one structured line', () => {
    expect(layoutMathOnRuledLines('x^2+6=42')).toEqual({
      latex: 'x^2+6=42',
      lineCount: 1,
      automatic: false,
    });
  });

  it('continues a long polynomial at top-level operators', () => {
    const latex = 'x^8+3x^7-5x^6+7x^5-11x^4+13x^3-17x^2+19x-23=0';
    const layout = layoutMathOnRuledLines(latex, 18);
    expect(layout.automatic).toBe(true);
    expect(layout.lineCount).toBeGreaterThan(2);
    expect(layout.latex).toMatch(/^\\begin\{multline\}/);
    expect(unwrapAutomaticMathLayout(layout.latex)).toBe(latex);
  });

  it('does not break inside fraction braces or user-created environments', () => {
    expect(splitLongMathLatex('x+\\frac{a+b+c+d+e+f}{y}+z', 8)).toEqual([
      'x',
      '+\\frac{a+b+c+d+e+f}{y}',
      '+z',
    ]);
    const matrix = '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}+x';
    expect(splitLongMathLatex(matrix, 3)).toEqual([matrix]);
  });

  it('continues at additive boundaries instead of splitting a multiplied term', () => {
    const rows = splitLongMathLatex(
      'x^8+2\\cdot x^7+3\\cdot x^6+4\\cdot x^5+5\\cdot x^4+6\\cdot x^3+7\\cdot x^2+8\\cdot x+9',
      20,
    );

    expect(rows.slice(1).every((row) => !/^\\(?:cdot|times|div)/.test(row))).toBe(true);
  });

  it('uses the same line count for notebook object height', () => {
    expect(automaticMathLineCount('a+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t')).toBeGreaterThan(1);
  });
});
