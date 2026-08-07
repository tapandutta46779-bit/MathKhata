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
  it('offers solving for supported complete calculus and equation forms', () => {
    expect(canOfferLocalSolve('\\int x^2\\,dx')).toBe(true);
    expect(canOfferLocalSolve('\\int_{0}^{2}x^2\\,dx')).toBe(true);
    expect(canOfferLocalSolve('\\int_0^2x^2\\,dx')).toBe(true);
    expect(canOfferLocalSolve('\\int _{0} ^{\\pi} \\cos x\\,\\mathrm{d}x')).toBe(true);
    expect(canOfferLocalSolve('x^2=4')).toBe(true);
    expect(canOfferLocalSolve('\\frac{d}{dx}\\left(x^3\\right)')).toBe(true);
    expect(canOfferLocalSolve('\\lim_{x\\to0}\\frac{\\sin(x)}{x}')).toBe(true);
    expect(canOfferLocalSolve('\\sum_{n=1}^{5}n')).toBe(true);
    expect(canOfferLocalSolve('\\prod_{n=1}^{5}n')).toBe(true);
    expect(canOfferLocalSolve('x^2=')).toBe(false);
    expect(canOfferLocalSolve('\\int_{0}x^2\\,dx')).toBe(false);
    expect(canOfferLocalSolve('\\int_{\\placeholder{}}^{2}x^2\\,dx')).toBe(false);
    expect(canOfferLocalSolve('\\int x^2')).toBe(false);
    expect(canOfferLocalSolve('6\\times4')).toBe(false);
  });

  it('evaluates derivatives, limits, finite sums, and finite products', async () => {
    const derivative = await solveLocally('\\frac{d}{dx}\\left(x^3\\right)');
    const limit = await solveLocally('\\lim_{x\\to0}\\frac{\\sin(x)}{x}');
    const sum = await solveLocally('\\sum_{n=1}^{5}n');
    const product = await solveLocally('\\prod_{n=1}^{5}n');

    expect(derivative.kind).toBe('derivative');
    expect(compact(derivative.resultLatex)).toBe('3\\cdotx^{2}');
    expect(limit.resultLatex).toBe('1');
    expect(sum.resultLatex).toBe('15');
    expect(product.resultLatex).toBe('120');
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

  it('falls back to antiderivative-at-bounds for elementary finite integrals', async () => {
    const result = await solveLocally('\\int_{0}^{\\pi}\\cos x\\,dx');

    expect(result.kind).toBe('integral');
    expect(result.resultLatex).toBe('0');
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
    ).rejects.toThrow(/convergence check/i);
  });
});
