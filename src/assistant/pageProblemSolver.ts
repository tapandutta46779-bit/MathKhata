import { canOfferLocalSolve, solveLocally } from './localMathSolver';
import type { MathObject } from '../domain/model';
import type { PageAnalysisItem, PageProblemGroup } from './pageAnalysis';
import { quickCalculate } from './quickCalculate';

export interface PageProblemSolveResult {
  label: string;
  resultLatex: string;
  explanation: string;
}

export async function solvePageProblem(group: PageProblemGroup): Promise<PageProblemSolveResult> {
  if (group.items.some((item) => item.suspicious)) {
    throw new Error('Review the suspected voice text before solving this problem.');
  }
  const expressions = group.items
    .filter((item): item is PageAnalysisItem & { object: MathObject } => item.object.type === 'math')
    .map((item) => item.object.latex.trim())
    .filter(Boolean);
  if (expressions.length === 0) throw new Error('This group does not contain mathematics to solve.');

  if (expressions.length === 1) {
    const arithmetic = quickCalculate(expressions[0]);
    if (arithmetic) {
      return { label: 'Result', resultLatex: arithmetic, explanation: 'Calculated locally without adding steps.' };
    }
    if (!canOfferLocalSolve(expressions[0])) {
      throw new Error('This complete expression is not supported by the local solver yet.');
    }
    const result = await solveLocally(expressions[0]);
    return { label: result.label, resultLatex: result.resultLatex, explanation: result.explanation };
  }

  if (!expressions.every((latex) => latex.includes('=') && !latex.endsWith('='))) {
    throw new Error('Confirm a group of complete equations before solving it as a system.');
  }
  const { default: nerdamer } = await import('nerdamer-prime');
  nerdamer.set('SILENCE_WARNINGS', true);
  try {
    const equations = expressions.map((latex) => String(nerdamer.convertFromLaTeX(latex)));
    const solved = nerdamer.solveEquations(equations);
    if (!Array.isArray(solved) || solved.length === 0 || !Array.isArray(solved[0])) {
      throw new Error('No distinct system solution was found.');
    }
    const lines = solved.map(([variable, value]) => {
      const valueLatex = nerdamer(String(value)).toTeX();
      return `${String(variable)}&=${valueLatex}`;
    });
    return {
      label: 'System solution',
      resultLatex: `\\begin{aligned}${lines.join('\\\\')}\\end{aligned}`,
      explanation: 'Solved together locally. The original page remains unchanged.',
    };
  } catch (error) {
    throw new Error(
      error instanceof Error && /distinct|solution/i.test(error.message)
        ? error.message
        : 'The local solver could not find a reliable system solution.',
      { cause: error },
    );
  }
}
