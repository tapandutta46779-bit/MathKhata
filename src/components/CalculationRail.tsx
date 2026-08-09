import { useEffect, useMemo, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import type { MathObject, Page } from '../domain/model';
import {
  appendCalculatedResult,
  quickCalculate,
} from '../assistant/quickCalculate';
import {
  canOfferLocalSolve,
  solveLocally,
  type LocalSolveResult,
} from '../assistant/localMathSolver';
import { useNotebookStore } from '../store/notebookStore';

interface CalculationRailProps {
  page: Page;
}

function ReadOnlyMath({ latex, label }: { latex: string; label: string }) {
  return (
    <math-field
      class="assistant-math"
      read-only="true"
      aria-label={label}
      ref={(element) => {
        if (element && (element as MathfieldElement).value !== latex) {
          (element as MathfieldElement).value = latex;
        }
      }}
    />
  );
}

function solverAction(latex: string): string {
  if (/\\det|\\begin\{[vV]matrix\}/.test(latex)) return 'Evaluate determinant';
  if (/rref|rowReduce/i.test(latex)) return 'Reduce matrix';
  if (/\^\{-1\}|\\operatorname\{(?:inv|inverse)\}/i.test(latex)) return 'Invert matrix';
  if (/\^\{?(?:T|\\mathsf\{T\}|\\top)/i.test(latex)) return 'Transpose matrix';
  if (/\\iiint/.test(latex)) return 'Solve triple integral';
  if (/\\iint/.test(latex)) return 'Solve double integral';
  if (/\\int/.test(latex)) return 'Solve integral';
  if (/\\nabla/.test(latex)) return 'Evaluate vector operator';
  if (/\\frac\{(?:d|\\partial)/.test(latex)) return 'Differentiate';
  if (/\\lim/.test(latex)) return 'Evaluate limit';
  if (/\\sum|\\prod/.test(latex)) return 'Evaluate series';
  return 'Solve equation';
}

export function CalculationRail({ page }: CalculationRailProps) {
  const selectedObjectId = useNotebookStore((state) => state.selectedObjectId);
  const editingObjectId = useNotebookStore((state) => state.editingObjectId);
  const updateMath = useNotebookStore((state) => state.updateMath);
  const createFlowObjects = useNotebookStore((state) => state.createFlowObjects);
  // Selection is the user's explicit target. Keep the editing id only as a
  // fallback because MathLive can retain focus briefly while a menu or virtual
  // keyboard transfers focus inside its shadow UI.
  const activeId = selectedObjectId ?? editingObjectId;
  const expression = page.objects.find(
    (object): object is MathObject => object.id === activeId && object.type === 'math',
  );
  const quickResult = useMemo(
    () => expression ? quickCalculate(expression.latex) : null,
    [expression],
  );
  const canSolve = expression ? canOfferLocalSolve(expression.latex) : false;
  const [solving, setSolving] = useState(false);
  const [solveResult, setSolveResult] = useState<LocalSolveResult | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const solveRequest = useRef(0);

  useEffect(() => {
    solveRequest.current += 1;
    setSolving(false);
    setSolveResult(null);
    setSolveError(null);
  }, [expression?.id, expression?.latex]);

  if (!expression || (!quickResult && !canSolve && !solveResult && !solveError)) return null;

  function acceptQuickResult() {
    if (!expression || !quickResult) return;
    updateMath(expression.id, appendCalculatedResult(expression.latex, quickResult));
  }

  async function solve() {
    if (!expression) return;
    const request = ++solveRequest.current;
    setSolving(true);
    setSolveError(null);
    setSolveResult(null);
    try {
      const result = await solveLocally(expression.latex);
      if (solveRequest.current === request) setSolveResult(result);
    } catch (error) {
      if (solveRequest.current === request) {
        setSolveError(error instanceof Error ? error.message : 'The local solver could not finish.');
      }
    } finally {
      if (solveRequest.current === request) setSolving(false);
    }
  }

  return (
    <aside
      className="calculation-rail"
      aria-label="Local math assistant"
      style={{ top: Math.max(12, expression.y) }}
    >
      {quickResult && (
        <button
          type="button"
          className="quick-result"
          aria-label={`Accept calculation result ${quickResult}`}
          onClick={acceptQuickResult}
        >
          <span>Result</span>
          <ReadOnlyMath latex={quickResult} label="Calculated result" />
          <kbd>Tab</kbd>
        </button>
      )}
      {!quickResult && canSolve && !solveResult && !solveError && (
        <button type="button" className="solve-offer" disabled={solving} onClick={() => void solve()}>
          <span>{solving ? 'Solving locally…' : solverAction(expression.latex)}</span>
          <small>Local CAS · checked steps shown</small>
        </button>
      )}
      {solveResult && (
        <div className="solve-result" aria-live="polite">
          <span>{solveResult.label}</span>
          <ReadOnlyMath latex={solveResult.resultLatex} label={solveResult.label} />
          <p>{solveResult.explanation}</p>
          {solveResult.steps && solveResult.steps.length > 0 && (
            <ol className="solve-steps" aria-label="Solution steps">
              {solveResult.steps.map((step, index) => (
                <li key={`${step.label}-${index}`}>
                  <strong>{step.label}</strong>
                  {step.latex && <ReadOnlyMath latex={step.latex} label={step.label} />}
                  {step.text && <p>{step.text}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="solve-result__actions">
          <button
            type="button"
            onClick={() => createFlowObjects([{ type: 'math', content: solveResult.resultLatex }])}
          >
            Add result
          </button>
          {solveResult.steps?.some((step) => step.latex) && (
            <button
              type="button"
              onClick={() => createFlowObjects(
                solveResult.steps!
                  .filter((step) => step.latex)
                  .map((step) => ({ type: 'math' as const, content: step.latex! })),
              )}
            >
              Add steps
            </button>
          )}
          </div>
        </div>
      )}
      {solveError && (
        <div className="solve-result solve-result--error" role="status">
          <span>Solver note</span>
          <p>{solveError}</p>
          <button type="button" onClick={() => setSolveError(null)}>Dismiss</button>
        </div>
      )}
    </aside>
  );
}
