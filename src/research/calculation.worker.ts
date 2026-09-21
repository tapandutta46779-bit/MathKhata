import { normalizeResearchExpressionLocal, evaluateResearchLatexLocal, evaluateScientificExpressionLocal } from './expressionEvaluator';
import type { ResearchTask } from './calculationClient';

self.onmessage = async ({ data }: MessageEvent<{ id: number; task: ResearchTask }>) => {
  const { id, task } = data;
  try {
    const value = task.kind === 'normalize' ? await normalizeResearchExpressionLocal(task.expression, task.allowedSymbols)
      : task.kind === 'scientific' ? await evaluateScientificExpressionLocal(task.expression, task.previousAnswer, task.angleUnit)
      : await evaluateResearchLatexLocal(task.expression);
    self.postMessage({ id, value });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Incomplete or unsupported calculation.' });
  }
};
