import { describe, expect, it } from 'vitest';
import {
  createNumericEvaluator,
  evaluateResearchLatex,
  separateGraphRestrictions,
  simpsonIntegral,
} from '../src/research/expressionEvaluator';

describe('research expression normalization and calculation', () => {
  it('keeps LaTeX exponent groups while extracting only graph restrictions', () => {
    expect(separateGraphRestrictions(String.raw`\sin(x)\cos(y)e^{a x}{x>0}`)).toEqual({
      base: String.raw`\sin(x)\cos(y)e^{a x}`,
      restrictions: ['x>0'],
    });
  });

  it('evaluates MathLive trigonometry and implicit products for 2D and 3D', async () => {
    const curve = await createNumericEvaluator(String.raw`\sin(x)`, ['x']);
    expect(curve({ x: Math.PI / 2 })).toBeCloseTo(1, 10);

    const surface = await createNumericEvaluator(String.raw`sin(x)*cos(y)\cdot e^{ax}`, ['a', 'x', 'y']);
    expect(surface({ a: 0.1, x: 0.5, y: 0.2 })).toBeCloseTo(
      Math.sin(0.5) * Math.cos(0.2) * Math.exp(0.05),
      10,
    );
  });

  it('calculates exact definite and iterated triple integrals', async () => {
    const definite = await evaluateResearchLatex(String.raw`\int_{0}^{1}x\,dx`);
    expect(definite.exact).toBe('1/2');
    expect(Number(definite.decimal)).toBeCloseTo(0.5, 12);

    const triple = await evaluateResearchLatex(String.raw`\int_{0}^{1}\int_{0}^{2}\int_{0}^{3}xyz\,dz\,dy\,dx`);
    expect(triple.exact).toBe('9/2');
    expect(Number(triple.decimal)).toBeCloseTo(4.5, 12);
  });

  it('calculates derivatives, finite sums, products, and determinants', async () => {
    await expect(evaluateResearchLatex(String.raw`\frac{d}{dx}x^3`)).resolves.toMatchObject({ exact: '3*x^2' });
    await expect(evaluateResearchLatex(String.raw`\sum_{k=1}^{5}k`)).resolves.toMatchObject({ exact: '15' });
    await expect(evaluateResearchLatex(String.raw`\prod_{k=1}^{5}k`)).resolves.toMatchObject({ exact: '120' });
    await expect(evaluateResearchLatex(String.raw`\begin{vmatrix}1&2\\3&4\end{vmatrix}`)).resolves.toMatchObject({ exact: '-2' });
  });

  it('measures numerical graph integrals without mutating the expression', () => {
    expect(simpsonIntegral((x) => Math.sin(x), 0, Math.PI)).toBeCloseTo(2, 9);
  });
});
