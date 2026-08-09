import { useEffect, useMemo, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import {
  AION_APPROXIMATE_DOWNLOAD,
  AION_RUNTIME_DESCRIPTION,
} from '../aion/runtime';
import { useAIONRuntime } from '../aion/useAIONRuntime';
import {
  analyzeNotebookPage,
  confirmProblemGroup,
  joinProblemWithPrevious,
  readableMathText,
  splitProblemGroup,
  type PageProblemGroup,
} from '../assistant/pageAnalysis';
import {
  solvePageProblem,
  type PageProblemSolveResult,
} from '../assistant/pageProblemSolver';
import { focusMathfield } from '../editor/mathfieldRegistry';
import { createDocumentContext } from '../extensions/providers';
import { useNotebookStore } from '../store/notebookStore';

interface SolveState {
  loading: boolean;
  result?: PageProblemSolveResult;
  error?: string;
}

const PAGE_ASSISTANT_PREFERENCE = 'mathkhata.page-assistant-open';

function storedOpenPreference(): boolean {
  try {
    return window.localStorage.getItem(PAGE_ASSISTANT_PREFERENCE) === 'true';
  } catch {
    return false;
  }
}

function storeOpenPreference(open: boolean) {
  try {
    window.localStorage.setItem(PAGE_ASSISTANT_PREFERENCE, String(open));
  } catch {
    // Storage may be unavailable in a locked-down browser. The in-memory
    // state still remains user-controlled for the current mount.
  }
}

function ReadOnlyMath({ latex, label }: { latex: string; label: string }) {
  return (
    <math-field
      class="page-assistant-math"
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

function AIONVisibleAnswer({ text }: { text: string }) {
  const lines = text.split(/\n+/).filter(Boolean);
  return (
    <div className="aion-result" aria-live="polite">
      {lines.map((line, lineIndex) => {
        const parts = line.split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\[[\s\S]*?\\\]|\\\([^)]*\\\))/g).filter(Boolean);
        return (
          <p key={`${lineIndex}-${line.slice(0, 20)}`}>
            {parts.map((part, partIndex) => {
              const math = part.startsWith('$$')
                ? part.slice(2, -2)
                : part.startsWith('$')
                  ? part.slice(1, -1)
                  : part.startsWith('\\[') || part.startsWith('\\(')
                    ? part.slice(2, -2)
                    : null;
              if (math === null) return <span key={partIndex}>{part.replace(/\*\*/g, '')}</span>;
              return <ReadOnlyMath key={partIndex} latex={math} label="AION answer mathematics" />;
            })}
          </p>
        );
      })}
    </div>
  );
}

function groupMathCount(group: PageProblemGroup): number {
  return group.items.filter((item) => item.object.type === 'math').length;
}

export function PageAssistantRail() {
  const notebook = useNotebookStore((state) => state.notebook);
  const currentPageId = useNotebookStore((state) => state.currentPageId);
  const selectedObjectId = useNotebookStore((state) => state.selectedObjectId);
  const tool = useNotebookStore((state) => state.tool);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const createFlowObjects = useNotebookStore((state) => state.createFlowObjects);
  const convertMathObjectToText = useNotebookStore((state) => state.convertMathObjectToText);
  const context = useMemo(
    () => notebook && currentPageId
      ? createDocumentContext(notebook, currentPageId, selectedObjectId)
      : null,
    [currentPageId, notebook, selectedObjectId],
  );
  const analysis = useMemo(
    () => context ? analyzeNotebookPage(context) : null,
    [context],
  );
  const analysisKey = analysis
    ? `${context?.currentPage.updatedAt}:${analysis.orderedObjectIds.join(',')}`
    : 'none';
  const [open, setOpen] = useState(storedOpenPreference);
  const [groups, setGroups] = useState<PageProblemGroup[]>([]);
  const [solveStates, setSolveStates] = useState<Record<string, SolveState>>({});
  const [aionQuestion, setAionQuestion] = useState('');
  const aion = useAIONRuntime();

  useEffect(() => {
    setGroups(analysis?.groups ?? []);
    setSolveStates({});
  }, [analysisKey]);

  useEffect(() => {
    const closeForOtherOverlay = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'page-assistant') {
        setOpen(false);
        storeOpenPreference(false);
        requestAnimationFrame(() => window.scrollTo({ left: 0, top: window.scrollY }));
      }
    };
    window.addEventListener('mathkhata:overlay-open', closeForOtherOverlay);
    return () => window.removeEventListener('mathkhata:overlay-open', closeForOtherOverlay);
  }, []);

  if (!analysis) return null;

  function selectItem(group: PageProblemGroup, itemIndex: number) {
    const object = group.items[itemIndex]?.object;
    if (!object) return;
    setSelectedObject(object.id);
    if (object.type === 'math') requestAnimationFrame(() => focusMathfield(object.id));
  }

  async function solve(group: PageProblemGroup) {
    setSolveStates((states) => ({ ...states, [group.id]: { loading: true } }));
    try {
      const result = await solvePageProblem(group);
      setSolveStates((states) => ({ ...states, [group.id]: { loading: false, result } }));
    } catch (error) {
      setSolveStates((states) => ({
        ...states,
        [group.id]: {
          loading: false,
          error: error instanceof Error ? error.message : 'The local page solver could not finish.',
        },
      }));
    }
  }

  function normalizeHorizontalScroll() {
    requestAnimationFrame(() => window.scrollTo({ left: 0, top: window.scrollY }));
  }

  function explainGroupWithAION(group: PageProblemGroup, groupIndex: number) {
    if (!context || aion.status !== 'ready') return;
    const lines = group.items.map((item, index) => {
      const value = item.object.type === 'math' ? item.object.latex : item.object.text;
      return `${index + 1}. ${item.object.type}: ${value}`;
    }).join('\n');
    aion.analyze(context, [
      `Solve or analyze only Problem ${groupIndex + 1} below. Do not combine it with other page problems.`,
      'Show a concise sequence of visible, checkable mathematical steps, state assumptions, and verify the final result where possible.',
      lines,
    ].join('\n'));
  }

  function closeAssistant() {
    setOpen(false);
    storeOpenPreference(false);
    normalizeHorizontalScroll();
  }

  function openAssistant() {
    window.dispatchEvent(new CustomEvent('mathkhata:overlay-open', { detail: 'page-assistant' }));
    setOpen(true);
    storeOpenPreference(true);
    normalizeHorizontalScroll();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="page-assistant-launcher"
        aria-label={`Open page assistant with ${groups.length} problem groups`}
        onClick={openAssistant}
      >
        <span>Page assistant</span>
        <strong>{groups.length}</strong>
      </button>
    );
  }

  const reviewCount = groups.filter((group) => group.needsReview).length;
  return (
    <aside
      className={`page-assistant${tool === 'voice' ? ' page-assistant--voice-open' : ''}`}
      aria-label="Whole-page math assistant"
      data-testid="page-assistant"
    >
      <header className="page-assistant__header">
        <div>
          <strong>Page assistant</strong>
          <span>Local structured page analysis</span>
        </div>
        <div className="page-assistant__header-actions">
          <button type="button" aria-label="Collapse page assistant" onClick={closeAssistant}>›</button>
          <button type="button" aria-label="Close page assistant" onClick={closeAssistant}>×</button>
        </div>
      </header>
      <div className="page-assistant__summary">
        <span>{groups.length} {groups.length === 1 ? 'problem group' : 'problem groups'}</span>
        <span>{reviewCount ? `${reviewCount} need review` : 'Grouping looks consistent'}</span>
        <button
          type="button"
          onClick={() => {
            setGroups(analysis.groups);
            setSolveStates({});
          }}
        >
          Analyze page again
        </button>
      </div>
      <section className="aion-card" aria-label="AION local mathematical assistant">
        <div className="aion-card__heading">
          <div>
            <strong>AION</strong>
            <span>Private local research model</span>
          </div>
          <em className={`aion-status aion-status--${aion.status}`}>{aion.status}</em>
        </div>
        <p>
          {AION_RUNTIME_DESCRIPTION}. AION uses a pretrained model; MathKhata has not claimed to
          train it. Deterministic page grouping and CAS verification remain independent fallbacks.
        </p>
        {aion.status === 'idle' && (
          <button type="button" onClick={aion.enable}>
            Check AION ({AION_APPROXIMATE_DOWNLOAD} local model)
          </button>
        )}
        {(aion.status === 'loading' || aion.status === 'analyzing') && (
          <div className="aion-progress" role="status">
            <span>{aion.message}</span>
            {aion.progress !== undefined && <progress max="100" value={aion.progress} />}
          </div>
        )}
        {aion.status === 'ready' && (
          <div className="aion-chat-input">
            <textarea
              rows={2}
              value={aionQuestion}
              aria-label="Ask AION about this page"
              placeholder="Ask about this page, request a proof, or solve with steps…"
              onChange={(event) => setAionQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && context) {
                  event.preventDefault();
                  aion.analyze(context, aionQuestion);
                }
              }}
            />
            <div>
              <button type="button" onClick={() => context && aion.analyze(context)}>
                Analyze page
              </button>
              <button
                type="button"
                className="primary-quiet"
                disabled={!aionQuestion.trim()}
                onClick={() => context && aion.analyze(context, aionQuestion)}
              >
                Ask AION
              </button>
            </div>
          </div>
        )}
        {aion.status === 'error' && (
          <div className="aion-error" role="status">
            <span>{aion.message}</span>
            <button type="button" onClick={aion.enable}>Retry AION</button>
          </div>
        )}
        {aion.result && <AIONVisibleAnswer text={aion.result} />}
        {aion.device && <small>Runs on this Mac through Ollama; page data stays local to the device.</small>}
      </section>
      <div className="page-assistant__groups">
        {groups.length === 0 && (
          <p className="page-assistant__empty">
            This page is blank. Add mathematics or a note and the local outline will update here
            without reopening the panel.
          </p>
        )}
        {groups.map((group, groupIndex) => {
          const mathCount = groupMathCount(group);
          const solveState = solveStates[group.id];
          const blockedSystem = group.kind === 'system' && group.needsReview;
          const canSolve = mathCount > 0 && !group.items.some((item) => item.suspicious) && !blockedSystem;
          return (
            <article className={`page-problem page-problem--${group.kind}`} key={group.id}>
              <div className="page-problem__heading">
                <div>
                  <strong>{group.heading || `Problem ${groupIndex + 1}`}</strong>
                  <span>{group.kind === 'system' ? 'Possible equation system' : group.kind === 'review' ? 'Recognition review' : group.kind === 'notes' ? 'Page notes' : 'Separate question'}</span>
                </div>
                <em className={group.needsReview ? 'needs-review' : ''}>
                  {group.needsReview ? 'Review' : `${Math.round(group.confidence * 100)}%`}
                </em>
              </div>
              <p className="page-problem__rationale">{group.rationale}</p>
              <div className="page-problem__items">
                {group.items.map((item, itemIndex) => (
                  <button
                    type="button"
                    className={`page-problem__item${item.suspicious ? ' is-suspicious' : ''}`}
                    key={item.object.id}
                    onClick={() => selectItem(group, itemIndex)}
                  >
                    <span>Line {analysis.orderedObjectIds.indexOf(item.object.id) + 1}</span>
                    {item.object.type === 'math'
                      ? <ReadOnlyMath latex={item.object.latex} label={`Page line ${itemIndex + 1}`} />
                      : <q>{item.object.text}</q>}
                    {item.issue && <small>{item.issue}</small>}
                  </button>
                ))}
              </div>
              <div className="page-problem__actions">
                {group.needsReview && (
                  <button type="button" onClick={() => setGroups((current) => confirmProblemGroup(current, group.id))}>
                    Keep together
                  </button>
                )}
                {mathCount > 1 && (
                  <button type="button" onClick={() => setGroups((current) => splitProblemGroup(current, group.id))}>
                    Split lines
                  </button>
                )}
                {groupIndex > 0 && (
                  <button type="button" onClick={() => setGroups((current) => joinProblemWithPrevious(current, group.id))}>
                    Join previous
                  </button>
                )}
                {canSolve && (
                  <button type="button" className="primary-quiet" disabled={solveState?.loading} onClick={() => void solve(group)}>
                    {solveState?.loading ? 'Solving locally…' : 'Solve this problem'}
                  </button>
                )}
                {mathCount > 0 && aion.status === 'ready' && (
                  <button type="button" onClick={() => explainGroupWithAION(group, groupIndex)}>
                    Explain with AION
                  </button>
                )}
              </div>
              {blockedSystem && <p className="page-problem__note">Confirm or split this inferred system before solving it together.</p>}
              {group.items.filter((item) => item.suspicious && item.object.type === 'math').map((item) => (
                <div className="page-problem__repair" key={`repair-${item.object.id}`}>
                  <span>Likely voice text</span>
                  <button
                    type="button"
                    onClick={() => item.object.type === 'math' && convertMathObjectToText(
                      item.object.id,
                      readableMathText(item.object.latex) || item.object.latex,
                    )}
                  >
                    Convert to Text
                  </button>
                </div>
              ))}
              {solveState?.result && (
                <div className="page-problem__result" aria-live="polite">
                  <span>{solveState.result.label}</span>
                  <ReadOnlyMath latex={solveState.result.resultLatex} label={solveState.result.label} />
                  <p>{solveState.result.explanation}</p>
                  <button type="button" onClick={() => createFlowObjects([{ type: 'math', content: solveState.result!.resultLatex }])}>
                    Add on next line
                  </button>
                </div>
              )}
              {solveState?.error && <p className="page-problem__error" role="status">{solveState.error}</p>}
            </article>
          );
        })}
      </div>
      <footer>Deterministic grouping and local CAS stay active with or without AION.</footer>
    </aside>
  );
}
