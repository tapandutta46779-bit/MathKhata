import {
  determinant,
  inverseMatrix,
  matrixToLatex,
  parseLatexMatrix,
  parseNumericMatrix,
  requestedMatrixOperation,
  rowReduce,
  symbolicDeterminantExpression,
  transposeMatrix,
} from './advancedLinearAlgebra';

export interface LocalSolveStep {
  label: string;
  latex?: string;
  text?: string;
}

export interface LocalSolveResult {
  kind: 'integral' | 'derivative' | 'limit' | 'summation' | 'product' | 'equation' | 'determinant' | 'matrix' | 'gradient' | 'laplacian';
  label: string;
  resultLatex: string;
  explanation: string;
  steps?: LocalSolveStep[];
}

interface MultiIntegralParts {
  integrandLatex: string;
  variables: string[];
  count: number;
}

function parseMultiIntegral(latex: string): MultiIntegralParts | null {
  const source = latex.trim().replace(/=$/, '').trim();
  const command = source.match(/^\\(iint|iiint)\b/);
  if (!command) return null;
  const count = command[1] === 'iint' ? 2 : 3;
  const body = source
    .slice(command[0].length)
    .replace(/\\[,!;:]/g, '')
    .replace(/\\(?:mathrm|operatorname|text)\{d\}/g, 'd')
    .trim();
  const differentialPattern = /d\s*([a-zA-Z])/g;
  const differentials = [...body.matchAll(differentialPattern)];
  if (differentials.length !== count || differentials[0].index === undefined) return null;
  const integrandLatex = body.slice(0, differentials[0].index).trim();
  if (!integrandLatex) return null;
  return { integrandLatex, variables: differentials.map((item) => item[1]), count };
}

function parseVectorOperator(latex: string): { kind: 'gradient' | 'laplacian'; expressionLatex: string } | null {
  const source = latex.trim().replace(/=$/, '').trim();
  const laplacian = source.match(/^\\nabla(?:\^\{?2\}?)?\s*(.+)$/s);
  if (!laplacian) return null;
  return {
    kind: /\\nabla\^\{?2\}?/.test(source) ? 'laplacian' : 'gradient',
    expressionLatex: stripOuterParentheses(laplacian[1]),
  };
}

function isClassicGaussianIntegral(latex: string): boolean {
  const compact = latex.replace(/\s+/g, '').replace(/\\left|\\right/g, '');
  return /^\\int_\{?-\\infty\}?\^\{?\\infty\}?e\^\{-?x\^\{?2\}?\}\\[,!;:]?dx=?$/i.test(compact)
    || /^\\int_\{?-\\infty\}?\^\{?\\infty\}?\\exp\(-?x\^\{?2\}?\)\\[,!;:]?dx=?$/i.test(compact);
}

interface BracedGroup {
  value: string;
  next: number;
}

interface IntegralParts {
  integrandLatex: string;
  variable: string;
  lowerLatex?: string;
  upperLatex?: string;
}

interface CalculusExpression {
  expressionLatex: string;
  variable: string;
  targetLatex?: string;
  order?: number;
  operator?: 'd' | 'partial';
}

interface BoundedSeries {
  expressionLatex: string;
  variable: string;
  lowerLatex: string;
  upperLatex: string;
}

interface NumericalIntegralEstimate {
  value: number;
  error: number;
  panels: number;
}

function simpsonEstimate(evaluate: (value: number) => number, lower: number, upper: number, panels: number): number {
  const step = (upper - lower) / panels;
  let weighted = evaluate(lower) + evaluate(upper);
  for (let index = 1; index < panels; index += 1) {
    weighted += (index % 2 === 0 ? 2 : 4) * evaluate(lower + index * step);
  }
  return weighted * step / 3;
}

function adaptiveSimpsonEstimate(
  evaluate: (value: number) => number,
  lower: number,
  upper: number,
): NumericalIntegralEstimate {
  let panels = 16;
  let previous = simpsonEstimate(evaluate, lower, upper, panels);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    panels *= 2;
    const current = simpsonEstimate(evaluate, lower, upper, panels);
    const error = Math.abs(current - previous) / 15;
    if (error <= 1e-11 * Math.max(1, Math.abs(current))) return { value: current, error, panels };
    previous = current;
  }
  return { value: previous, error: Number.NaN, panels };
}

function finiteDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('The numerical integral is not finite on the stated interval.');
  // Keep one guard digit behind the adaptive Simpson stopping target. Showing
  // more digits would make the final place look exact even though it is only
  // a numerical estimate.
  return Number(value.toPrecision(11)).toString();
}

function derivativeName(order: number, partial: boolean): string {
  if (order === 1) return partial ? 'Partial derivative' : 'Derivative';
  const ordinal = order === 2 ? 'Second' : order === 3 ? 'Third' : `${order}th`;
  return `${ordinal} ${partial ? 'partial ' : ''}derivative`;
}

/**
 * Nerdamer's LaTeX converter treats `\\sin x^3` as `(sin x)^3`, although
 * standard mathematical precedence reads it as `sin(x^3)`. MathLive emits
 * this compact form, so make the function argument explicit before handing
 * it to the CAS. Function powers such as `\\sin^2 x` are intentionally left
 * unchanged because they mean `(sin x)^2`.
 */
export function normalizeLatexForCAS(latex: string): string {
  let normalized = latex.replace(
    /\\(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|log|ln|exp)\s+((?:[A-Za-z0-9]|\\[A-Za-z]+)(?:\s*[_^](?:\{[^{}]*\}|[A-Za-z0-9]))*)/g,
    (_, functionName: string, argument: string) => `\\${functionName}\\left(${argument.trim()}\\right)`,
  );
  // Nerdamer's LaTeX bridge treats compact products such as `xy` as one
  // identifier and `x\\sin(z)` as `xsin*z`. MathLive emits both forms, so
  // make those implicit products explicit before conversion.
  normalized = normalized.replace(
    /(?<![\\A-Za-z])([A-Za-z]{2,})(?![A-Za-z])/g,
    (run: string) => run.split('').join(' * '),
  );
  normalized = normalized.replace(
    /([A-Za-z0-9)}\]])\s*(?=\\(?:sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|log|ln|exp)\b)/g,
    '$1 * ',
  );
  return normalized;
}

function readBraced(source: string, start: number): BracedGroup | null {
  if (source[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return { value: source.slice(start + 1, index), next: index + 1 };
  }
  return null;
}

function readScriptArgument(source: string, start: number): BracedGroup | null {
  const braced = readBraced(source, start);
  if (braced) return braced;
  const command = source.slice(start).match(/^\\[a-zA-Z]+/);
  if (command) return { value: command[0], next: start + command[0].length };
  const token = source[start];
  return token && /[0-9a-zA-Z]/.test(token)
    ? { value: token, next: start + 1 }
    : null;
}

function parseIntegral(latex: string): IntegralParts | null {
  const source = latex.trim().replace(/=$/, '').trim();
  const integralIndex = source.indexOf('\\int');
  if (integralIndex < 0) return null;
  let cursor = integralIndex + 4;
  const skipWhitespace = () => {
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
  };
  let lowerLatex: string | undefined;
  let upperLatex: string | undefined;
  skipWhitespace();
  for (let count = 0; count < 2; count += 1) {
    const marker = source[cursor];
    if (marker !== '_' && marker !== '^') break;
    const group = readScriptArgument(source, cursor + 1);
    if (!group) return null;
    if (marker === '_') lowerLatex = group.value;
    else upperLatex = group.value;
    cursor = group.next;
    skipWhitespace();
  }
  const body = source
    .slice(cursor)
    .replace(/\\[,!;:]/g, '')
    .replace(/\\(?:mathrm|operatorname|text)\{d\}/g, 'd')
    .replace(/\\differentialD/g, 'd')
    .trim();
  const differential = body.match(/d\s*([a-zA-Z])$/);
  if (!differential || differential.index === undefined) return null;
  const integrandLatex = body.slice(0, differential.index).trim();
  if (!integrandLatex) return null;
  return {
    integrandLatex,
    variable: differential[1],
    lowerLatex,
    upperLatex,
  };
}

function stripOuterParentheses(latex: string): string {
  const clean = latex.trim();
  const match = clean.match(/^\\left\((.*)\\right\)$/s);
  return match?.[1] ?? clean;
}

function parseDerivative(latex: string): CalculusExpression | null {
  const source = latex.trim().replace(/=$/, '').trim();
  const match = source.match(
    /^\\frac\{(d|\\partial)(?:\^\{?(\d+)\}?)?\}\{(?:d|\\partial\s*)?([a-zA-Z])(?:\^\{?(\d+)\}?)?\}(.+)$/s,
  );
  if (!match) return null;
  const numeratorOrder = Number(match[2] ?? 1);
  const denominatorOrder = Number(match[4] ?? numeratorOrder);
  if (numeratorOrder !== denominatorOrder || numeratorOrder < 1 || numeratorOrder > 10) return null;
  return {
    variable: match[3],
    expressionLatex: stripOuterParentheses(match[5]),
    order: numeratorOrder,
    operator: match[1] === '\\partial' ? 'partial' : 'd',
  };
}

interface NestedIntegralPart {
  variable: string;
  lowerLatex?: string;
  upperLatex?: string;
}

interface NestedIntegral {
  integrandLatex: string;
  parts: NestedIntegralPart[];
}

function parseNestedIntegrals(latex: string): NestedIntegral | null {
  const source = latex.trim().replace(/=$/, '').trim();
  let cursor = 0;
  const bounds: Array<{ lowerLatex?: string; upperLatex?: string }> = [];
  const skipWhitespace = () => { while (/\s/.test(source[cursor] ?? '')) cursor += 1; };
  while (source.startsWith('\\int', cursor) && !/[A-Za-z]/.test(source[cursor + 4] ?? '')) {
    cursor += 4;
    skipWhitespace();
    let lowerLatex: string | undefined;
    let upperLatex: string | undefined;
    for (let count = 0; count < 2; count += 1) {
      const marker = source[cursor];
      if (marker !== '_' && marker !== '^') break;
      const group = readScriptArgument(source, cursor + 1);
      if (!group) return null;
      if (marker === '_') lowerLatex = group.value;
      else upperLatex = group.value;
      cursor = group.next;
      skipWhitespace();
    }
    bounds.push({ lowerLatex, upperLatex });
  }
  if (bounds.length < 2) return null;
  const body = source
    .slice(cursor)
    .replace(/\\[,!;:]/g, '')
    .replace(/\\(?:mathrm|operatorname|text)\{d\}/g, 'd')
    .trim();
  const differentialPattern = /d\s*([a-zA-Z])/g;
  const differentials = [...body.matchAll(differentialPattern)];
  if (differentials.length !== bounds.length || differentials[0].index === undefined) return null;
  const integrandLatex = body.slice(0, differentials[0].index).trim();
  if (!integrandLatex) return null;
  return {
    integrandLatex,
    parts: differentials.map((item, index) => ({
      variable: item[1],
      ...bounds[bounds.length - 1 - index],
    })),
  };
}

function parseLimit(latex: string): CalculusExpression | null {
  const source = latex.trim().replace(/=$/, '').trim();
  if (!source.startsWith('\\lim_')) return null;
  const script = readScriptArgument(source, 5);
  if (!script) return null;
  const approach = script.value.match(/^([a-zA-Z])\\to(.+)$/s);
  const expressionLatex = source.slice(script.next).trim();
  if (!approach || !expressionLatex) return null;
  return {
    variable: approach[1],
    targetLatex: approach[2].trim(),
    expressionLatex,
  };
}

function parseBoundedSeries(latex: string, command: '\\sum' | '\\prod'): BoundedSeries | null {
  const source = latex.trim().replace(/=$/, '').trim();
  if (!source.startsWith(command)) return null;
  let cursor = command.length;
  if (source[cursor] !== '_') return null;
  const lower = readScriptArgument(source, cursor + 1);
  if (!lower) return null;
  cursor = lower.next;
  if (source[cursor] !== '^') return null;
  const upper = readScriptArgument(source, cursor + 1);
  if (!upper) return null;
  cursor = upper.next;
  const assignment = lower.value.match(/^([a-zA-Z])=(.+)$/s);
  const expressionLatex = source.slice(cursor).trim();
  if (!assignment || !expressionLatex) return null;
  return {
    variable: assignment[1],
    lowerLatex: assignment[2],
    upperLatex: upper.value,
    expressionLatex,
  };
}

export function canOfferLocalSolve(latex: string): boolean {
  if (/\\placeholder|#\?|\u25a1/.test(latex)) return false;
  const matrixOperation = requestedMatrixOperation(latex);
  if (matrixOperation === 'determinant' && parseLatexMatrix(latex)) return true;
  if (matrixOperation && matrixOperation !== 'determinant' && parseNumericMatrix(latex)) return true;
  const nested = parseNestedIntegrals(latex);
  if (nested) {
    return nested.parts.every((part) => (part.lowerLatex === undefined) === (part.upperLatex === undefined));
  }
  if (parseMultiIntegral(latex) || parseVectorOperator(latex)) return true;
  if (/\\int(?![A-Za-z])/.test(latex)) {
    const integral = parseIntegral(latex);
    if (!integral) return false;
    return (integral.lowerLatex === undefined) === (integral.upperLatex === undefined);
  }
  if (parseDerivative(latex) || parseLimit(latex)) return true;
  if (parseBoundedSeries(latex, '\\sum') || parseBoundedSeries(latex, '\\prod')) return true;
  if (!latex.includes('=') || latex.trim().endsWith('=')) return false;
  return /[a-zA-Z]/.test(latex.replace(/\\(?:times|div|cdot)/g, ''));
}

export async function solveLocally(latex: string): Promise<LocalSolveResult> {
  const { default: nerdamer } = await import('nerdamer-prime');
  nerdamer.set('SILENCE_WARNINGS', true);

  const nestedIntegral = parseNestedIntegrals(latex);
  if (nestedIntegral) {
    if (nestedIntegral.parts.some((part) => (part.lowerLatex === undefined) !== (part.upperLatex === undefined))) {
      throw new Error('Complete both bounds on every nested integral before solving.');
    }
    let result = nerdamer.convertFromLaTeX(normalizeLatexForCAS(nestedIntegral.integrandLatex));
    const nestedSteps: LocalSolveStep[] = [
      {
        label: 'Read the order of integration',
        latex: `${nestedIntegral.integrandLatex}\\,${nestedIntegral.parts.map((part) => `d${part.variable}`).join('\\,')}`,
      },
    ];
    for (const part of nestedIntegral.parts) {
      if (part.lowerLatex !== undefined && part.upperLatex !== undefined) {
        if (/\\infty/i.test(`${part.lowerLatex} ${part.upperLatex}`)) {
          throw new Error('Nested improper integrals require a separate convergence and order-of-integration check.');
        }
        const lower = nerdamer.convertFromLaTeX(normalizeLatexForCAS(part.lowerLatex)).toString();
        const upper = nerdamer.convertFromLaTeX(normalizeLatexForCAS(part.upperLatex)).toString();
        const antiderivative = nerdamer.integrate(result, part.variable);
        result = nerdamer.simplify(`(${antiderivative.evaluate({ [part.variable]: upper }).toString()})-(${antiderivative.evaluate({ [part.variable]: lower }).toString()})`);
      } else result = nerdamer.integrate(result, part.variable);
      nestedSteps.push({
        label: `Integrate with respect to ${part.variable}`,
        latex: part.lowerLatex !== undefined && part.upperLatex !== undefined
          ? `\\left[\\int ${nestedIntegral.integrandLatex}\\,d${part.variable}\\right]_{${part.lowerLatex}}^{${part.upperLatex}}=${result.toTeX()}`
          : `\\int ${nestedIntegral.integrandLatex}\\,d${part.variable}=${result.toTeX()}`,
      });
    }
    const resultLatex = result.toTeX();
    if (/\\int|integrate/i.test(`${result.toString()} ${resultLatex}`)) {
      throw new Error('The local CAS could not find a reliable closed form for this nested integral.');
    }
    const definite = nestedIntegral.parts.every((part) => part.lowerLatex !== undefined);
    return {
      kind: 'integral',
      label: nestedIntegral.parts.length === 2 ? 'Double integral value' : 'Multiple integral value',
      resultLatex: definite ? resultLatex : `${resultLatex}+C`,
      explanation: `Evaluated in the stated order with respect to ${nestedIntegral.parts.map((part) => part.variable).join(', ')}.`,
      steps: nestedSteps,
    };
  }

  const matrixOperation = requestedMatrixOperation(latex);
  if (matrixOperation) {
    if (matrixOperation === 'determinant') {
      const parsed = parseLatexMatrix(latex);
      if (!parsed) throw new Error('Complete every determinant cell before solving.');
      if (!parsed.cells.every((row) => row.length === parsed.cells.length)) {
        throw new Error('A determinant requires a square matrix.');
      }
      const numericMatrix = parseNumericMatrix(latex);
      const determinantResult = numericMatrix
        ? nerdamer(String(determinant(numericMatrix)))
        : nerdamer.simplify(symbolicDeterminantExpression(
          parsed.cells.map((row) => row.map((cell) => nerdamer.convertFromLaTeX(normalizeLatexForCAS(cell)).toString())),
        ));
      const determinantLatex = determinantResult.toTeX();
      const equationIndex = latex.indexOf('=', parsed.end);
      if (equationIndex >= 0) {
        const rightLatex = latex.slice(equationIndex + 1).trim();
        if (!rightLatex) throw new Error('Complete the right side of the determinant equation.');
        const right = nerdamer.convertFromLaTeX(normalizeLatexForCAS(rightLatex)).toString();
        const equation = nerdamer(`${determinantResult.toString()}=(${right})`);
        const variable = equation.variables()[0];
        if (!variable) {
          const truth = nerdamer.simplify(`(${determinantResult.toString()})-(${right})`).toString() === '0';
          return {
            kind: 'determinant',
            label: 'Determinant equation',
            resultLatex: truth ? '\\mathrm{true}' : '\\mathrm{false}',
            explanation: 'Evaluated the determinant and compared both sides.',
            steps: [
              { label: 'Expand determinant', latex: `\\det(A)=${determinantLatex}` },
              { label: 'Compare', latex: `${determinantLatex}=${rightLatex}` },
            ],
          };
        }
        const solutions = nerdamer.solve(equation, variable);
        const solutionLatex = solutions.latex();
        if (!solutionLatex || solutionLatex === '[]') throw new Error(`No solution for ${variable} was found.`);
        return {
          kind: 'determinant',
          label: `Determinant equation · solve for ${variable}`,
          resultLatex: `${variable}\\in ${solutionLatex}`,
          explanation: 'Expanded the symbolic determinant first, then solved the resulting equation locally.',
          steps: [
            { label: 'Expand determinant', latex: `\\det(A)=${determinantLatex}` },
            { label: 'Form equation', latex: `${determinantLatex}=${rightLatex}` },
            { label: 'Solve', latex: `${variable}\\in ${solutionLatex}` },
          ],
        };
      }
      return {
        kind: 'determinant',
        label: 'Determinant',
        resultLatex: determinantLatex,
        explanation: numericMatrix
          ? 'Evaluated with pivoted Gaussian elimination on this device.'
          : 'Expanded and simplified the symbolic determinant on this device.',
        steps: [
          { label: 'Matrix determinant', latex: `\\det(A)=${determinantLatex}` },
        ],
      };
    }
    const matrix = parseNumericMatrix(latex);
    if (!matrix) throw new Error('This matrix operation currently requires a complete numeric matrix. Symbolic determinants are supported.');
    if (matrixOperation === 'inverse') {
      const inverse = matrixToLatex(inverseMatrix(matrix));
      return {
        kind: 'matrix',
        label: 'Matrix inverse',
        resultLatex: inverse,
        explanation: 'Computed locally by Gauss–Jordan elimination with pivoting.',
        steps: [
          { label: 'Augment with the identity', latex: '\\left[A\\mid I\\right]' },
          { label: 'Apply row operations', latex: '\\left[I\\mid A^{-1}\\right]' },
          { label: 'Inverse', latex: inverse },
        ],
      };
    }
    if (matrixOperation === 'transpose') {
      const transposed = matrixToLatex(transposeMatrix(matrix));
      return {
        kind: 'matrix',
        label: 'Matrix transpose',
        resultLatex: transposed,
        explanation: 'Interchanged rows and columns locally.',
        steps: [{ label: 'Transpose', latex: transposed }],
      };
    }
    const reduced = matrixToLatex(rowReduce(matrix));
    return {
      kind: 'matrix',
      label: 'Reduced row echelon form',
      resultLatex: reduced,
      explanation: 'Reduced locally with Gauss–Jordan elimination.',
      steps: [
        { label: 'Apply elementary row operations', text: 'Normalize each pivot and eliminate the other entries in its column.' },
        { label: 'Reduced matrix', latex: reduced },
      ],
    };
  }

  const multiIntegral = parseMultiIntegral(latex);
  if (multiIntegral) {
    let result = nerdamer.convertFromLaTeX(normalizeLatexForCAS(multiIntegral.integrandLatex));
    for (const variable of multiIntegral.variables) result = nerdamer.integrate(result, variable);
    const resultLatex = result.toTeX();
    if (/\\int|integrate/i.test(`${result.toString()} ${resultLatex}`)) {
      throw new Error('The local CAS could not find a reliable closed form for this multiple integral.');
    }
    return {
      kind: 'integral',
      label: multiIntegral.count === 2 ? 'Double antiderivative' : 'Triple antiderivative',
      resultLatex,
      explanation: `Computed a particular mixed antiderivative successively with respect to ${multiIntegral.variables.join(', ')}. The fully general indefinite result may also include terms annihilated by the corresponding mixed derivative. Add bounds or a region only when the original problem supplies them.`,
      steps: [
        { label: 'Order of integration', text: `Integrate successively in ${multiIntegral.variables.join(', ')}.` },
        { label: 'Particular mixed antiderivative', latex: resultLatex },
        { label: 'Verification', text: `Differentiate successively with respect to ${[...multiIntegral.variables].reverse().join(', ')} to recover the integrand.` },
      ],
    };
  }

  const vectorOperator = parseVectorOperator(latex);
  if (vectorOperator) {
    const expression = nerdamer.convertFromLaTeX(normalizeLatexForCAS(vectorOperator.expressionLatex));
    const variables = expression.variables().filter((variable: string) => /^[xyzuvw]$/.test(variable));
    if (variables.length === 0) throw new Error('No spatial variable was found for this vector-calculus operator.');
    if (vectorOperator.kind === 'gradient') {
      const entries = variables.map((variable: string) => nerdamer.diff(expression, variable).toTeX());
      return {
        kind: 'gradient',
        label: 'Gradient',
        resultLatex: `\\begin{bmatrix}${entries.join('\\\\')}\\end{bmatrix}`,
        explanation: `Computed the partial derivatives with respect to ${variables.join(', ')}.`,
      };
    }
    const terms = variables.map((variable: string) => nerdamer.diff(expression, variable, 2).toString());
    const result = nerdamer.simplify(terms.map((term: string) => `(${term})`).join('+'));
    return {
      kind: 'laplacian',
      label: 'Laplacian',
      resultLatex: result.toTeX(),
      explanation: `Summed the second partial derivatives with respect to ${variables.join(', ')}.`,
    };
  }

  const integral = parseIntegral(latex);
  if (integral) {
    if ((integral.lowerLatex === undefined) !== (integral.upperLatex === undefined)) {
      throw new Error('Complete both integral bounds before asking the local solver.');
    }
    if (isClassicGaussianIntegral(latex)) {
      return {
        kind: 'integral',
        label: 'Gaussian integral',
        resultLatex: '\\sqrt{\\pi}',
        explanation: 'Used the classical convergent Gaussian integral over the real line.',
        steps: [
          { label: 'Square the integral', latex: 'I^2=\\int_{-\\infty}^{\\infty}\\int_{-\\infty}^{\\infty}e^{-(x^2+y^2)}\\,dx\\,dy' },
          { label: 'Use polar coordinates', latex: 'I^2=\\int_0^{2\\pi}\\int_0^{\\infty}e^{-r^2}r\\,dr\\,d\\theta=\\pi' },
          { label: 'Take the positive root', latex: 'I=\\sqrt{\\pi}' },
        ],
      };
    }
    const integrand = nerdamer.convertFromLaTeX(normalizeLatexForCAS(integral.integrandLatex));
    const definite = integral.lowerLatex !== undefined && integral.upperLatex !== undefined;
    const lower = definite ? nerdamer.convertFromLaTeX(normalizeLatexForCAS(integral.lowerLatex!)).toString() : undefined;
    const upper = definite ? nerdamer.convertFromLaTeX(normalizeLatexForCAS(integral.upperLatex!)).toString() : undefined;
    if (definite && /\\infty|infinity/i.test(`${integral.lowerLatex} ${integral.upperLatex}`)) {
      throw new Error('This improper integral needs a convergence check before evaluation. Infinite-bound convergence is not yet verified by the local solver.');
    }
    const antiderivative = nerdamer.integrate(integrand, integral.variable);
    const antiderivativeUnresolved = /\\int|integrate/i.test(`${antiderivative.toString()} ${antiderivative.toTeX()}`);
    if (definite && antiderivativeUnresolved) {
      const lowerNumber = Number(nerdamer(lower!).evaluate().text('decimals'));
      const upperNumber = Number(nerdamer(upper!).evaluate().text('decimals'));
      if (!Number.isFinite(lowerNumber) || !Number.isFinite(upperNumber)) {
        throw new Error('The local solver found no symbolic antiderivative and could not convert the finite bounds to numbers.');
      }
      const estimate = adaptiveSimpsonEstimate((value) => {
        const evaluated = Number(integrand.evaluate({ [integral.variable]: value }).text('decimals'));
        if (!Number.isFinite(evaluated)) {
          throw new Error('The integrand is not finite throughout the stated interval. Check for a singularity.');
        }
        return evaluated;
      }, lowerNumber, upperNumber);
      const numericalLatex = finiteDecimal(estimate.value);
      const errorText = Number.isFinite(estimate.error)
        ? `The last Simpson refinement changed the estimate by about ${estimate.error.toExponential(2)} after error scaling.`
        : 'The panel limit was reached; use a checked high-precision integrator for a tighter error target.';
      return {
        kind: 'integral',
        label: 'Numerical integral value',
        resultLatex: `\\approx ${numericalLatex}`,
        explanation: 'No reliable elementary antiderivative was found, so the finite integral was evaluated numerically instead of presenting an incomplete symbolic derivation.',
        steps: [
          { label: 'Integral', latex: `\\int_{${integral.lowerLatex}}^{${integral.upperLatex}}${integral.integrandLatex}\\,d${integral.variable}` },
          { label: 'Adaptive Simpson method', latex: 'S_n=\\frac{h}{3}\\left(f(x_0)+4\\sum f(x_{2k-1})+2\\sum f(x_{2k})+f(x_n)\\right)', text: `Refined an even partition to ${estimate.panels} panels. ${errorText}` },
          { label: 'Numerical value', latex: `\\int_{${integral.lowerLatex}}^{${integral.upperLatex}}${integral.integrandLatex}\\,d${integral.variable}\\approx ${numericalLatex}` },
        ],
      };
    }
    let result = definite
      ? nerdamer.defint(integrand, lower!, upper!, integral.variable)
      : antiderivative;
    if (definite && /\\int|defint|integrate/i.test(`${result.toString()} ${result.toTeX()}`)) {
      // Nerdamer leaves several elementary finite definite integrals (for
      // example ∫₀^π cos(x)dx) unevaluated. Compute an antiderivative and
      // apply the fundamental theorem before declaring failure.
      if (!antiderivativeUnresolved) {
        const atUpper = antiderivative.evaluate({ [integral.variable]: upper! });
        const atLower = antiderivative.evaluate({ [integral.variable]: lower! });
        result = nerdamer.simplify(`(${atUpper.toString()})-(${atLower.toString()})`);
      }
    }
    const resultLatex = result.toTeX();
    if (/\\int|defint|integrate/i.test(`${result.toString()} ${resultLatex}`)) {
      throw new Error('The local solver could not find a reliable closed form for this integral.');
    }
    const indefinite = integral.lowerLatex === undefined || integral.upperLatex === undefined;
    const antiderivativeLatex = antiderivative.toTeX();
    return {
      kind: 'integral',
      label: indefinite ? 'Antiderivative' : 'Integral value',
      resultLatex: indefinite ? `${resultLatex}+C` : resultLatex,
      explanation: indefinite
        ? `Integrated with respect to ${integral.variable}.`
        : `Evaluated from ${integral.lowerLatex} to ${integral.upperLatex}.`,
      steps: indefinite
        ? [
          { label: 'Integrand', latex: `\\int ${integral.integrandLatex}\\,d${integral.variable}` },
          { label: 'Antiderivative', latex: `${antiderivativeLatex}+C` },
        ]
        : [
          { label: 'Find an antiderivative', latex: `F(${integral.variable})=${antiderivativeLatex}` },
          { label: 'Apply the bounds', latex: `\\left[${antiderivativeLatex}\\right]_{${integral.lowerLatex}}^{${integral.upperLatex}}` },
          { label: 'Simplify', latex: resultLatex },
        ],
    };
  }

  const derivative = parseDerivative(latex);
  if (derivative) {
    const expression = nerdamer.convertFromLaTeX(normalizeLatexForCAS(derivative.expressionLatex));
    const result = nerdamer.diff(expression, derivative.variable, derivative.order ?? 1);
    const operator = derivative.operator === 'partial' ? '\\partial' : 'd';
    const order = derivative.order ?? 1;
    return {
      kind: 'derivative',
      label: `${derivativeName(order, derivative.operator === 'partial')} with respect to ${derivative.variable}`,
      resultLatex: result.toTeX(),
      explanation: 'Differentiated symbolically in the local CAS.',
      steps: [
        { label: 'Differentiate', latex: `\\frac{${operator}${order > 1 ? `^{${order}}` : ''}}{${operator}${derivative.variable}${order > 1 ? `^{${order}}` : ''}}\\left(${derivative.expressionLatex}\\right)` },
        { label: 'Simplify', latex: result.toTeX() },
      ],
    };
  }

  const limit = parseLimit(latex);
  if (limit?.targetLatex) {
    const expression = nerdamer.convertFromLaTeX(normalizeLatexForCAS(limit.expressionLatex));
    const target = nerdamer.convertFromLaTeX(normalizeLatexForCAS(limit.targetLatex)).toString();
    const result = nerdamer.limit(expression, limit.variable, target);
    return {
      kind: 'limit',
      label: `Limit as ${limit.variable} approaches ${limit.targetLatex}`,
      resultLatex: result.toTeX(),
      explanation: 'Evaluated symbolically in the local CAS.',
    };
  }

  for (const [command, kind, label] of [
    ['\\sum', 'summation', 'Finite sum'],
    ['\\prod', 'product', 'Finite product'],
  ] as const) {
    const series = parseBoundedSeries(latex, command);
    if (!series) continue;
    if (/\\infty/.test(series.upperLatex)) {
      throw new Error(`${label} currently requires a finite upper bound.`);
    }
    const expression = nerdamer.convertFromLaTeX(normalizeLatexForCAS(series.expressionLatex));
    const lower = nerdamer.convertFromLaTeX(normalizeLatexForCAS(series.lowerLatex)).toString();
    const upper = nerdamer.convertFromLaTeX(normalizeLatexForCAS(series.upperLatex)).toString();
    const result = command === '\\sum'
      ? nerdamer.sum(expression, series.variable, lower, upper)
      : nerdamer.product(expression, series.variable, lower, upper);
    return {
      kind,
      label,
      resultLatex: result.toTeX(),
      explanation: `Evaluated from ${series.lowerLatex} to ${series.upperLatex} in the local CAS.`,
    };
  }

  const clean = latex.trim();
  if (clean.includes('=') && !clean.endsWith('=')) {
    const equation = nerdamer.convertFromLaTeX(normalizeLatexForCAS(clean));
    const variable = equation.variables()[0];
    if (!variable) throw new Error('No variable was found to solve for.');
    const solutions = nerdamer.solve(equation, variable);
    const solutionLatex = solutions.latex();
    if (!solutionLatex || solutionLatex === '[]') {
      throw new Error(`No solution for ${variable} was found.`);
    }
    return {
      kind: 'equation',
      label: `Solve for ${variable}`,
      resultLatex: `${variable}\\in ${solutionLatex}`,
      explanation: 'Solved locally. Check domain restrictions before using the result.',
    };
  }

  throw new Error('This expression is not yet supported by the local solver.');
}
