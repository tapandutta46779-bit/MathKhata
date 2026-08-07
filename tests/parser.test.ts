import { describe, expect, it } from 'vitest';
import { parseMathSpeech } from '../src/voice/mathSpeechParser';

function compact(latex: string): string {
  return latex.replace(/\s+/g, '');
}

describe('spoken mathematics parser', () => {
  it.each([
    ['x squared plus six x minus forty equals zero', 'x^2+6x-40=0'],
    ['x cubed plus two x plus c', 'x^3+2x+c'],
    [
      'x equals negative six plus or minus square root of thirty six plus one hundred sixty all over two',
      'x=\\frac{-6\\pm\\sqrt{36+160}}{2}',
    ],
    ['integral from zero to two x squared d x', '\\int_{0}^{2}x^2\\,dx'],
    [
      'sum from n equals one to infinity one over n squared',
      '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}',
    ],
  ])('parses “%s” compositionally', (spoken, expected) => {
    const candidate = parseMathSpeech(spoken, 0);
    expect(compact(candidate.latex)).toBe(compact(expected));
    expect(candidate.unknownTokens).toEqual([]);
  });

  it('groups an ambiguous root phrase and discloses that interpretation', () => {
    const candidate = parseMathSpeech('square root of x plus one', 0);
    expect(compact(candidate.latex)).toBe('\\sqrt{x+1}');
    expect(candidate.ambiguities).toHaveLength(1);
    expect(candidate.confidence).toBeLessThan(0.9);
  });

  it('supports negative decimals, common functions, powers, and grouped fractions', () => {
    expect(compact(parseMathSpeech('negative twelve point five plus sine x').latex)).toBe(
      '-12.5+\\sin\\left(x\\right)',
    );
    expect(compact(parseMathSpeech('one over x cubed').latex)).toBe('\\frac{1}{x^3}');
    expect(compact(parseMathSpeech('x plus one whole thing over n').latex)).toBe(
      '\\frac{x+1}{n}',
    );
  });

  it('surfaces unrecognized words instead of silently discarding them', () => {
    const candidate = parseMathSpeech('x plus wobble');
    expect(candidate.unknownTokens).toContain('wobble');
    expect(candidate.latex).toContain('operatorname');
    expect(candidate.confidence).toBeLessThan(0.6);
  });
});

