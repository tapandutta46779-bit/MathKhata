import { describe, expect, it } from 'vitest';
import { compileNumericProgram, boundedCache, gridValues } from '../src/research/numericProgram';
import { createNumericEvaluator } from '../src/research/expressionEvaluator';
import nerdamer from 'nerdamer-prime';

describe('numerical research rendering', () => {
  it('bounds grid work even when spacing underflows at a distant viewport', () => {
    expect(gridValues(-100_000, 100_000, .00001)).toHaveLength(1200);
    expect(gridValues(1e20, 1e20 + 1e6, .00001).length).toBeLessThanOrEqual(1200);
    expect(gridValues(0, Infinity, 1)).toEqual([]);
    expect(gridValues(-1, 1, 1)).toEqual([-1, 0, 1]);
  });
  it('preserves operator precedence, powers, constants and undefined domains', () => {
    expect(compileNumericProgram('-x^2')({ x: 3 })).toBe(-9);
    expect(compileNumericProgram('2^3^2')({})).toBe(512);
    expect(compileNumericProgram('2^-3')({})).toBe(.125);
    expect(compileNumericProgram('x^(1/3)')({ x: -8 })).toBe(-2);
    expect(compileNumericProgram('x^(2/3)')({ x: -8 })).toBeCloseTo(4);
    expect(compileNumericProgram('sin(pi/2)+log(e)')({})).toBeCloseTo(2);
    expect(compileNumericProgram('1/x')({ x: 0 })).toBeNaN();
    expect(compileNumericProgram('sqrt(x)')({ x: -1 })).toBeNaN();
  });
  it('does not allow code or object-property evaluation', () => {
    for (const input of ['globalThis.alert(1)', 'constructor(1)', 'x;alert(1)', 'x[0]', 'x=2']) {
      expect(() => compileNumericProgram(input)).toThrow();
    }
  });
  it('agrees with CAS on sampled curves and surfaces', async () => {
    for (const expression of ['sin(x)*cos(y)+x^2/10', 'exp(-x^2)+abs(y)', 'sqrt(x^2+y^2)', 'log(x^2+1)', '1/(x^2+1)', 'tan(x/5)', 'sinh(x)/cosh(y)']) {
      const evaluate = await createNumericEvaluator(expression, ['x', 'y']);
      const reference = nerdamer(expression);
      for (let i = -8; i <= 8; i++) {
        const scope = { x: i / 3, y: (i + 1) / 4 };
        expect(evaluate(scope)).toBeCloseTo(Number(reference.evaluate(scope).text('decimals')), 9);
      }
    }
  });
  it('reuses compiled expressions and bounds cache memory', async () => {
    const variablePower = await createNumericEvaluator('x^a', ['x', 'a']);
    expect(variablePower({ x: -8, a: 1 / 3 })).toBeCloseTo(-2);
    expect(await createNumericEvaluator('sin(x)', ['x'])).toBe(await createNumericEvaluator('sin(x)', ['x']));
    const cache = boundedCache<string, number>(2);
    cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined(); expect(cache.get('c')).toBe(3);
  });
  it('samples six 29x29 surfaces within an interactive computation budget', async () => {
    const evaluate = await createNumericEvaluator('sin(x)*cos(y)+x^2/10', ['x', 'y']);
    const start = performance.now(); let sum = 0;
    for (let i = 0; i < 5046; i++) sum += evaluate({ x: (i % 29) / 3, y: Math.floor(i / 29) % 29 / 3 });
    const elapsed = performance.now() - start;
    expect(sum).toBeCloseTo(14923.542526341582, 7);
    expect(elapsed).toBeLessThan(150);
    console.info(`Six-surface numerical sampling: ${elapsed.toFixed(2)} ms`);
  });
});
