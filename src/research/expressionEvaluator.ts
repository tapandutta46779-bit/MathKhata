const KNOWN_IDENTIFIERS = new Set([
  'abs', 'acos', 'acosh', 'acot', 'acsc', 'asec', 'asin', 'asinh', 'atan', 'atanh',
  'ceil', 'cos', 'cosh', 'cot', 'coth', 'csc', 'csch', 'determinant', 'diff', 'e',
  'erf', 'exp', 'factorial', 'floor', 'gamma', 'Infinity', 'integrate', 'log', 'max',
  'min', 'mod', 'pi', 'product', 'sec', 'sech', 'sign', 'sin', 'sinh', 'sqrt', 'sum',
  'tan', 'tanh', 'theta', 'alpha', 'beta', 'gamma', 'delta', 'lambda', 'mu', 'phi',
  'psi', 'omega',
]);

export interface CheckedResearchResult {
  latex: string;
  exact: string;
  decimal: string;
  verified: boolean;
  method: string;
}

function expandIdentifier(token: string, allowedSymbols: ReadonlySet<string>): string {
  if (KNOWN_IDENTIFIERS.has(token) || allowedSymbols.has(token) || token.length < 2) return token;
  if (/^[A-Za-z]+$/.test(token)) return [...token].join('*');
  return token;
}

function expandImplicitProducts(source: string, allowedSymbols: readonly string[]): string {
  const allowed = new Set(allowedSymbols);
  const powered = source.replace(/\^([A-Za-z]{2,})\b/g, (_match, token: string) => `^(${expandIdentifier(token, allowed)})`);
  return powered.replace(/\b[A-Za-z]{2,}\b/g, (token) => expandIdentifier(token, allowed));
}

export function separateGraphRestrictions(expression: string): { base: string; restrictions: string[] } {
  const restrictions: string[] = [];
  const capture = (_match: string, condition: string) => {
    restrictions.push(condition.trim());
    return '';
  };
  let base = expression.replace(/\\left\\\{([^{}]*(?:<=|>=|=|<|>)[^{}]*)\\right\\\}/g, capture);
  // Only comparison-bearing braces are graph restrictions. Exponent,
  // subscript, fraction, matrix, and integral groups must remain intact.
  base = base.replace(/\{([^{}]*(?:<=|>=|=|<|>)[^{}]*)\}/g, capture);
  return { base: base.trim(), restrictions };
}

export async function normalizeResearchExpression(
  expression: string,
  allowedSymbols: readonly string[] = [],
): Promise<string> {
  const { default: nerdamer } = await import('nerdamer-prime');
  nerdamer.set('SILENCE_WARNINGS', true);
  const clean = expression
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\\left|\\right/g, '')
    .replace(/\\,/g, ' ');
  if (!clean) throw new Error('Expression is empty.');
  const converted = /\\|[{}]/.test(clean)
    ? nerdamer.convertFromLaTeX(clean).toString()
    : nerdamer(clean).toString();
  return expandImplicitProducts(converted, allowedSymbols);
}

export async function createNumericEvaluator(
  expression: string,
  allowedSymbols: readonly string[] = [],
) {
  const { default: nerdamer } = await import('nerdamer-prime');
  const source = await normalizeResearchExpression(expression, allowedSymbols);
  const parsed = nerdamer(source);
  return (substitutions: Record<string, number>) => {
    const value = Number(parsed.evaluate(substitutions).text('decimals'));
    return Number.isFinite(value) ? value : Number.NaN;
  };
}

function compactLatex(latex: string): string {
  return latex
    .replace(/\s+/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\,/g, '')
    .replace(/\\(?:mathrm|operatorname)\{d\}/g, 'd');
}

async function evaluateBoundedIntegral(latex: string): Promise<CheckedResearchResult | null> {
  const compact = compactLatex(latex);
  const command = /\\(iiint|iint|int)(?:_\{([^{}]+)\}|_([^\\^_]+))?(?:\^\{([^{}]+)\}|\^([^\\^_]+))?/y;
  const integrals: Array<{ kind: string; lower: string; upper: string }> = [];
  let cursor = 0;
  while (cursor < compact.length) {
    command.lastIndex = cursor;
    const match = command.exec(compact);
    if (!match) break;
    integrals.push({ kind: match[1], lower: match[2] ?? match[3] ?? '', upper: match[4] ?? match[5] ?? '' });
    cursor = command.lastIndex;
  }
  if (!integrals.length) return null;
  if (integrals.some((entry) => entry.kind !== 'int')) {
    throw new Error('For double or triple integrals, insert one bounded integral template for each variable.');
  }
  if (integrals.some((entry) => !entry.lower || !entry.upper)) {
    throw new Error('Every integral needs both a lower and an upper bound.');
  }
  const tail = compact.slice(cursor);
  const differentialSuffix = /((?:d[A-Za-z])+)$/u.exec(tail);
  if (!differentialSuffix) throw new Error('Add a differential such as dx at the end.');
  const differentials = [...differentialSuffix[1].matchAll(/d([A-Za-z])/g)].map((match) => match[1]);
  if (differentials.length !== integrals.length) {
    throw new Error('The number of bounded integrals and differentials must match.');
  }
  const integrandLatex = tail.slice(0, differentialSuffix.index);
  if (!integrandLatex) throw new Error('Enter an integrand between the bounds and differentials.');
  const variables = [...differentials].reverse();
  const { default: nerdamer } = await import('nerdamer-prime');
  let exact = await normalizeResearchExpression(integrandLatex, variables);
  for (let index = integrals.length - 1; index >= 0; index -= 1) {
    const variable = variables[index];
    const lower = await normalizeResearchExpression(integrals[index].lower, variables);
    const upper = await normalizeResearchExpression(integrals[index].upper, variables);
    exact = nerdamer(`defint((${exact}),(${lower}),(${upper}),${variable})`).toString();
  }
  const result = nerdamer(exact);
  return {
    latex: result.toTeX(),
    exact: result.toString(),
    decimal: result.evaluate().text('decimals'),
    verified: true,
    method: integrals.length === 1 ? 'Exact definite integral' : `Exact ${integrals.length}-variable iterated integral`,
  };
}

async function evaluateDerivative(latex: string): Promise<CheckedResearchResult | null> {
  const compact = compactLatex(latex);
  const match = /^\\frac\{(?:d|\\partial)\}\{(?:d|\\partial)([A-Za-z])\}(.+)$/u.exec(compact);
  if (!match) return null;
  const { default: nerdamer } = await import('nerdamer-prime');
  const source = await normalizeResearchExpression(match[2], [match[1]]);
  const result = nerdamer.diff(source, match[1]);
  return {
    latex: result.toTeX(),
    exact: result.toString(),
    decimal: result.evaluate().text('decimals'),
    verified: true,
    method: `Exact derivative with respect to ${match[1]}`,
  };
}

async function evaluateFiniteSequence(latex: string): Promise<CheckedResearchResult | null> {
  const compact = compactLatex(latex);
  const match = /^\\(sum|prod)_\{([A-Za-z])=([^{}]+)\}\^\{([^{}]+)\}(.+)$/u.exec(compact);
  if (!match) return null;
  const { default: nerdamer } = await import('nerdamer-prime');
  const [, operation, variable, lowerLatex, upperLatex, bodyLatex] = match;
  const body = await normalizeResearchExpression(bodyLatex, [variable]);
  const lower = await normalizeResearchExpression(lowerLatex, [variable]);
  const upper = await normalizeResearchExpression(upperLatex, [variable]);
  const result = nerdamer(`${operation === 'sum' ? 'sum' : 'product'}((${body}),${variable},(${lower}),(${upper}))`);
  return {
    latex: result.toTeX(),
    exact: result.toString(),
    decimal: result.evaluate().text('decimals'),
    verified: true,
    method: operation === 'sum' ? 'Exact finite sum' : 'Exact finite product',
  };
}

async function evaluateMatrix(latex: string): Promise<CheckedResearchResult | null> {
  const matrix = /\\begin\{(matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}([\s\S]+?)\\end\{\1\}/u.exec(latex);
  if (!matrix) return null;
  const rows = matrix[2].split(/\\\\/).map((row) => row.split('&'));
  if (!rows.length || rows.some((row) => row.length !== rows[0].length)) throw new Error('Matrix rows must have equal length.');
  const normalizedRows = await Promise.all(rows.map(async (row) => Promise.all(row.map((cell) => normalizeResearchExpression(cell)))));
  const { default: nerdamer } = await import('nerdamer-prime');
  const source = `matrix(${normalizedRows.map((row) => `[${row.join(',')}]`).join(',')})`;
  const determinantRequested = matrix[1] === 'vmatrix' || matrix[1] === 'Vmatrix' || /\\det/.test(latex);
  if (!determinantRequested) throw new Error('Matrix recognized. Use determinant bars or det(…) to calculate a scalar result.');
  const result = nerdamer(`determinant(${source})`);
  return {
    latex: result.toTeX(),
    exact: result.toString(),
    decimal: result.evaluate().text('decimals'),
    verified: true,
    method: 'Exact matrix determinant',
  };
}

export async function evaluateResearchLatex(latex: string): Promise<CheckedResearchResult> {
  const specialized = await evaluateBoundedIntegral(latex)
    ?? await evaluateDerivative(latex)
    ?? await evaluateFiniteSequence(latex)
    ?? await evaluateMatrix(latex);
  if (specialized) return specialized;
  const { default: nerdamer } = await import('nerdamer-prime');
  const source = await normalizeResearchExpression(latex);
  const result = nerdamer(source).evaluate();
  return {
    latex: result.toTeX(),
    exact: result.toString(),
    decimal: result.text('decimals'),
    verified: true,
    method: 'Exact local CAS evaluation',
  };
}

export function simpsonIntegral(
  evaluate: (value: number) => number,
  lower: number,
  upper: number,
  intervals = 600,
): number {
  const count = Math.max(2, intervals + (intervals % 2));
  const step = (upper - lower) / count;
  let total = evaluate(lower) + evaluate(upper);
  if (!Number.isFinite(total)) return Number.NaN;
  for (let index = 1; index < count; index += 1) {
    const value = evaluate(lower + index * step);
    if (!Number.isFinite(value)) return Number.NaN;
    total += (index % 2 === 0 ? 2 : 4) * value;
  }
  return total * step / 3;
}
