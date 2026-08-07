export interface LocalSolveResult {
  kind: 'integral' | 'equation';
  label: string;
  resultLatex: string;
  explanation: string;
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
  }
  const body = source
    .slice(cursor)
    .replace(/\\[,!;:]/g, '')
    .replace(/\\mathrm\{d\}/g, 'd')
    .trim();
  const differential = body.match(/d([a-zA-Z])$/);
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

export function canOfferLocalSolve(latex: string): boolean {
  if (/\\placeholder|#\?|\u25a1/.test(latex)) return false;
  if (/\\int(?![A-Za-z])/.test(latex)) {
    const integral = parseIntegral(latex);
    if (!integral) return false;
    return (integral.lowerLatex === undefined) === (integral.upperLatex === undefined);
  }
  if (!latex.includes('=') || latex.trim().endsWith('=')) return false;
  return /[a-zA-Z]/.test(latex.replace(/\\(?:times|div|cdot)/g, ''));
}

export async function solveLocally(latex: string): Promise<LocalSolveResult> {
  const { default: nerdamer } = await import('nerdamer-prime');
  nerdamer.set('SILENCE_WARNINGS', true);
  const integral = parseIntegral(latex);
  if (integral) {
    if ((integral.lowerLatex === undefined) !== (integral.upperLatex === undefined)) {
      throw new Error('Complete both integral bounds before asking the local solver.');
    }
    const integrand = nerdamer.convertFromLaTeX(integral.integrandLatex);
    const result = integral.lowerLatex !== undefined && integral.upperLatex !== undefined
      ? nerdamer.defint(
          integrand,
          nerdamer.convertFromLaTeX(integral.lowerLatex).toString(),
          nerdamer.convertFromLaTeX(integral.upperLatex).toString(),
          integral.variable,
        )
      : nerdamer.integrate(integrand, integral.variable);
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
