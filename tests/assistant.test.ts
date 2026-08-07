import { describe, expect, it } from 'vitest';
import {
  appendCalculatedResult,
  quickCalculate,
} from '../src/assistant/quickCalculate';
import {
  canOfferLocalSolve,
  solveLocally,
} from '../src/assistant/localMathSolver';

function compact(latex: string): string {
  return latex.replace(/\s+/g, '');
}

describe('local quick calculation', () => {
  it.each([
    ['6\\times 4', '24'],
    ['2+3\\times4', '14'],
    ['\\frac{9}{2}', '4.5'],
    ['\\sqrt{81}', '9'],
    ['\\sqrt9', '3'],
    ['2\\left(3+4\\right)', '14'],
    ['-2^2', '-4'],
    ['2^{-2}', '0.25'],
    ['2^{3^2}', '512'],
  ])('calculates %s without evaluating code', (latex, expected) => {
    expect(quickCalculate(latex)).toBe(expected);
  });

  it.each(['', 'x+2', '6=', '\\int x\\,dx', '\\frac{1}{}']) (
    'does not offer an unsafe or incomplete calculation for %s',
    (latex) => expect(quickCalculate(latex)).toBeNull(),
  );

  it('adds the accepted result to the current line', () => {
    expect(appendCalculatedResult('6\\times4', '24')).toBe('6\\times4=24');
    expect(appendCalculatedResult('6\\times4=', '24')).toBe('6\\times4=24');
  });
});

describe('opt-in local symbolic solver', () => {
  it('offers solving only for integrals and complete variable equations', () => {
    expect(canOfferLocalSolve('\\int x^2\\,dx')).toBe(true);
    expect(canOfferLocalSolve('\\int_{0}^{2}x^2\\,dx')).toBe(true);
    expect(canOfferLocalSolve('\\int_0^2x^2\\,dx')).toBe(true);
    expect(canOfferLocalSolve('x^2=4')).toBe(true);
    expect(canOfferLocalSolve('x^2=')).toBe(false);
    expect(canOfferLocalSolve('\\int_{0}x^2\\,dx')).toBe(false);
    expect(canOfferLocalSolve('\\int_{\\placeholder{}}^{2}x^2\\,dx')).toBe(false);
    expect(canOfferLocalSolve('\\int x^2')).toBe(false);
    expect(canOfferLocalSolve('6\\times4')).toBe(false);
  });

  it('finds an antiderivative without adding steps', async () => {
    const result = await solveLocally('\\int x^2\\,dx');

    expect(result.kind).toBe('integral');
    expect(compact(result.resultLatex)).toBe('\\frac{x^{3}}{3}+C');
  });

  it('evaluates a definite integral locally', async () => {
    const result = await solveLocally('\\int_{0}^{2}x^2\\,dx');

    expect(compact(result.resultLatex)).toBe('\\frac{8}{3}');
  });

  it('accepts MathLive compact single-token integral bounds', async () => {
    const result = await solveLocally('\\int_0^2x^2\\,dx');

    expect(compact(result.resultLatex)).toBe('\\frac{8}{3}');
  });

  it('does not silently discard a single incomplete bound', async () => {
    await expect(solveLocally('\\int_{0}x^2\\,dx')).rejects.toThrow(/both integral bounds/i);
  });

  it('solves a variable equation locally', async () => {
    const result = await solveLocally('x^2=4');

    expect(result.kind).toBe('equation');
    expect(compact(result.resultLatex)).toBe('x\\in[2,-2]');
  });

  it('reports when no reliable closed form was found', async () => {
    await expect(
      solveLocally('\\int_{0}^{\\infty}e^{x^2+3x+5}\\,dx'),
    ).rejects.toThrow(/could not find a reliable closed form/i);
  });
});
