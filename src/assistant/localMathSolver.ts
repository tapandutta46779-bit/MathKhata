import {
  determinant,
  matrixToLatex,
  parseNumericMatrix,
  requestedMatrixOperation,
  rowReduce,
} from './advancedLinearAlgebra';

export interface LocalSolveResult {
  kind: 'integral' | 'derivative' | 'limit' | 'summation' | 'product' | 'equation' | 'determinant' | 'matrix' | 'gradient' | 'laplacian';
  label: string;
  resultLatex: string;
  explanation: string;
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
}

interface BoundedSeries {
  expressionLatex: string;
  variable: string;
  lowerLatex: string;
  upperLatex: string;
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
    /^\\frac\{(?:d|\\partial)(?:\^\{?(\d+)\}?)?\}\{(?:d|\\partial\s*)?([a-zA-Z])(?:\^\{?(\d+)\}?)?\}(.+)$/s,
  );
  if (!match) return null;
  const numeratorOrder = Number(match[1] ?? 1);
  const denominatorOrder = Number(match[3] ?? numeratorOrder);
  if (numeratorOrder !== denominatorOrder || numeratorOrder < 1 || numeratorOrder > 10) return null;
  return { variable: match[2], expressionLatex: stripOuterParentheses(match[4]), order: numeratorOrder };
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
  if (requestedMatrixOperation(latex) && parseNumericMatrix(latex)) return true;
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
    let result = nerdamer.convertFromLaTeX(nestedIntegral.integrandLatex);
    for (const part of nestedIntegral.parts) {
      if (part.lowerLatex !== undefined && part.upperLatex !== undefined) {
        if (/\\infty/i.test(`${part.lowerLatex} ${part.upperLatex}`)) {
          throw new Error('Nested improper integrals require a separate convergence and order-of-integration check.');
        }
        const lower = nerdamer.convertFromLaTeX(part.lowerLatex).toString();
        const upper = nerdamer.convertFromLaTeX(part.upperLatex).toString();
        const antiderivative = nerdamer.integrate(result, part.variable);
        result = nerdamer.simplify(`(${antiderivative.evaluate({ [part.variable]: upper }).toString()})-(${antiderivative.evaluate({ [part.variable]: lower }).toString()})`);
      } else result = nerdamer.integrate(result, part.variable);
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
    };
  }

  const matrixOperation = requestedMatrixOperation(latex);
  if (matrixOperation) {
    const matrix = parseNumericMatrix(latex);
    if (!matrix) throw new Error('Use a complete numeric matrix before asking the local solver.');
    if (matrixOperation === 'determinant') {
      const value = determinant(matrix);
      return {
        kind: 'determinant',
        label: 'Determinant',
        resultLatex: String(value),
        explanation: 'Evaluated with pivoted Gaussian elimination on this device.',
      };
    }
    return {
      kind: 'matrix',
      label: 'Reduced row echelon form',
      resultLatex: matrixToLatex(rowReduce(matrix)),
      explanation: 'Reduced locally with Gauss–Jordan elimination.',
    };
  }

  const multiIntegral = parseMultiIntegral(latex);
  if (multiIntegral) {
    let result = nerdamer.convertFromLaTeX(multiIntegral.integrandLatex);
    for (const variable of multiIntegral.variables) result = nerdamer.integrate(result, variable);
    const resultLatex = result.toTeX();
    if (/\\int|integrate/i.test(`${result.toString()} ${resultLatex}`)) {
      throw new Error('The local CAS could not find a reliable closed form for this multiple integral.');
    }
    return {
      kind: 'integral',
      label: multiIntegral.count === 2 ? 'Double antiderivative' : 'Triple antiderivative',
      resultLatex: `${resultLatex}+C`,
      explanation: `Integrated successively with respect to ${multiIntegral.variables.join(', ')}. Add bounds or a region for a definite volume integral.`,
    };
  }

  const vectorOperator = parseVectorOperator(latex);
  if (vectorOperator) {
    const expression = nerdamer.convertFromLaTeX(vectorOperator.expressionLatex);
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
      };
    }
    const integrand = nerdamer.convertFromLaTeX(integral.integrandLatex);
    const definite = integral.lowerLatex !== undefined && integral.upperLatex !== undefined;
    const lower = definite ? nerdamer.convertFromLaTeX(integral.lowerLatex!).toString() : undefined;
    const upper = definite ? nerdamer.convertFromLaTeX(integral.upperLatex!).toString() : undefined;
    if (definite && /\\infty|infinity/i.test(`${integral.lowerLatex} ${integral.upperLatex}`)) {
      throw new Error('This improper integral needs a convergence check before evaluation. Infinite-bound convergence is not yet verified by the local solver.');
    }
    let result = definite
      ? nerdamer.defint(integrand, lower!, upper!, integral.variable)
      : nerdamer.integrate(integrand, integral.variable);
    if (definite && /\\int|defint|integrate/i.test(`${result.toString()} ${result.toTeX()}`)) {
      // Nerdamer leaves several elementary finite definite integrals (for
      // example ∫₀^π cos(x)dx) unevaluated. Compute an antiderivative and
      // apply the fundamental theorem before declaring failure.
      const antiderivative = nerdamer.integrate(integrand, integral.variable);
      if (!/\\int|integrate/i.test(`${antiderivative.toString()} ${antiderivative.toTeX()}`)) {
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
    return {
      kind: 'integral',
      label: indefinite ? 'Antiderivative' : 'Integral value',
      resultLatex: indefinite ? `${resultLatex}+C` : resultLatex,
      explanation: indefinite
        ? `Integrated with respect to ${integral.variable}.`
        : `Evaluated from ${integral.lowerLatex} to ${integral.upperLatex}.`,
    };
  }

  const derivative = parseDerivative(latex);
  if (derivative) {
    const expression = nerdamer.convertFromLaTeX(derivative.expressionLatex);
    const result = nerdamer.diff(expression, derivative.variable, derivative.order ?? 1);
    return {
      kind: 'derivative',
      label: `${(derivative.order ?? 1) > 1 ? `${derivative.order}th derivative` : 'Derivative'} with respect to ${derivative.variable}`,
      resultLatex: result.toTeX(),
      explanation: 'Differentiated symbolically in the local CAS.',
    };
  }

  const limit = parseLimit(latex);
  if (limit?.targetLatex) {
    const expression = nerdamer.convertFromLaTeX(limit.expressionLatex);
    const target = nerdamer.convertFromLaTeX(limit.targetLatex).toString();
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
    const expression = nerdamer.convertFromLaTeX(series.expressionLatex);
    const lower = nerdamer.convertFromLaTeX(series.lowerLatex).toString();
    const upper = nerdamer.convertFromLaTeX(series.upperLatex).toString();
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
    const equation = nerdamer.convertFromLaTeX(clean);
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
