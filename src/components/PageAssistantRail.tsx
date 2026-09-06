import { useEffect, useMemo, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import { useAIONRuntime } from '../aion/useAIONRuntime';
import { formatAIONElapsed } from '../aion/runtime';
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
import { flushWritingDraft, useWritingDraft } from '../editor/writingDraft';

interface SolveState {
  loading: boolean;
  result?: PageProblemSolveResult;
  error?: string;
}

interface AIONConversationTurn {
  id: string;
  question: string;
  answer: string;
  elapsedSeconds?: number;
  complete?: boolean;
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

function ReadOnlyMath({ latex, label, display = false }: { latex: string; label: string; display?: boolean }) {
  const field = (
    <math-field
      class={`page-assistant-math${display ? ' page-assistant-math--display' : ''}`}
      read-only="true"
      aria-label={label}
      ref={(element) => {
        if (element && (element as MathfieldElement).value !== latex) {
          (element as MathfieldElement).value = latex;
        }
      }}
    />
  );
  if (!display) return field;
  return (
    <div
      className="page-assistant-math-scroll"
      role="group"
      aria-label={`${label}. Scroll horizontally for the complete expression.`}
      tabIndex={0}
    >
      {field}
    </div>
  );
}

function normalizeAIONAnswer(text: string): string {
  return text
    .replace(/```(?:latex|tex|math)\s*([\s\S]*?)```/gi, (_, math: string) => `\\[${math.trim()}\\]`)
    .replace(/```(?:markdown|text)?\s*([\s\S]*?)```/gi, (_, content: string) => content.trim())
    .replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, math: string) => `\\[${math.trim()}\\]`)
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, math: string) => `\\[${math.trim()}\\]`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, math: string) => `\\(${math.trim()}\\)`)
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, math: string) => `$$${math.trim()}$$`)
    .trim();
}

function InlineAIONContent({ text }: { text: string }) {
  const parts = text
    .split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g)
    .filter(Boolean);
  return (
    <>
      {parts.map((part, partIndex) => {
        const math = part.startsWith('$$')
          ? part.slice(2, -2)
          : part.startsWith('$')
            ? part.slice(1, -1)
            : part.startsWith('\\[') || part.startsWith('\\(')
              ? part.slice(2, -2)
              : null;
        if (math === null) return <span key={partIndex}>{part.replace(/\*\*/g, '')}</span>;
        return (
          <ReadOnlyMath
            key={partIndex}
            latex={math.trim()}
            label="AION answer mathematics"
            display={part.startsWith('$$') || part.startsWith('\\[')}
          />
        );
      })}
    </>
  );
}

function bareAIONMath(line: string): string | null {
  const clean = line.replace(/[.;:]$/, '').trim();
  if (/^\\(?:int|iint|iiint|oint|sum|prod|lim|frac|sqrt|begin|det|nabla)\b/.test(clean)) return clean;
  if (/\\(?:sin|cos|tan|log|ln|exp|partial|cdot|times|infty)\b/.test(clean)
    && !/\b(?:the|this|that|with|where|because|function|integral|equation|therefore)\b/i.test(clean)) return clean;
  if (/^[\dA-Za-z_^{}()[\]+\-*/=\\,.|\s]+$/.test(clean)
    && /[=^_\\]/.test(clean)
    && !/\b(?:the|this|that|is|are|we|and|or|step)\b/i.test(clean)) return clean;
  return null;
}

function AIONVisibleAnswer({ text }: { text: string }) {
  const lines = normalizeAIONAnswer(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <article className="aion-result" aria-live="polite">
      {lines.map((line, lineIndex) => {
        const key = `${lineIndex}-${line.slice(0, 24)}`;
        if (/^-{3,}$/.test(line)) return <hr key={key} />;
        const bareMath = bareAIONMath(line);
        if (bareMath) return <ReadOnlyMath key={key} latex={bareMath} label="AION answer mathematics" display />;
        if (/^#{1,4}\s+/.test(line)) {
          return <h3 key={key}><InlineAIONContent text={line.replace(/^#{1,4}\s+/, '')} /></h3>;
        }
        if (/^(?:Step\s+\d+|Answer|Result|Verification|Method|Conclusion)\s*:/i.test(line)) {
          return <h3 key={key}><InlineAIONContent text={line} /></h3>;
        }
        if (/^(?:[-*]|\d+[.)])\s+/.test(line)) {
          return <div className="aion-answer-line" key={key}><span className="aion-answer-line__marker">•</span><p><InlineAIONContent text={line.replace(/^(?:[-*]|\d+[.)])\s+/, '')} /></p></div>;
        }
        return <p key={key}><InlineAIONContent text={line} /></p>;
      })}
    </article>
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
  const draft = useWritingDraft((state) => state.draft);
  const context = useMemo(
    () => notebook && currentPageId
      ? createDocumentContext(notebook, currentPageId, selectedObjectId, [],
        draft?.notebookId === notebook.id && draft.pageId === currentPageId ? draft.objects : [])
      : null,
    [currentPageId, notebook, selectedObjectId, draft],
  );
  const analysis = useMemo(
    () => context ? analyzeNotebookPage(context) : null,
    [context],
  );
  const [open, setOpen] = useState(storedOpenPreference);
  const [groups, setGroups] = useState<PageProblemGroup[]>([]);
  const [solveStates, setSolveStates] = useState<Record<string, SolveState>>({});
  const [aionQuestion, setAionQuestion] = useState('');
  const [conversation, setConversation] = useState<AIONConversationTurn[]>([]);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [assistantView, setAssistantView] = useState<'chat' | 'outline'>('chat');
  const aion = useAIONRuntime();

  useEffect(() => {
    setGroups(analysis?.groups ?? []);
    setSolveStates({});
  }, [context?.currentPage]);

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

  useEffect(() => {
    if (!activeTurnId) return;
    const complete = aion.status !== 'analyzing' && aion.status !== 'loading';
    setConversation((current) => current.map((turn) => (
      turn.id === activeTurnId
        ? {
            ...turn,
            answer: aion.result || turn.answer,
            elapsedSeconds: aion.elapsedSeconds,
            complete,
          }
        : turn
    )));
    if (complete) setActiveTurnId(null);
  }, [activeTurnId, aion.elapsedSeconds, aion.result, aion.status]);

  useEffect(() => {
    if (!activeTurnId) return;
    const frame = requestAnimationFrame(() => {
      const element = conversationRef.current;
      if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTurnId]);

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

  function submitAION(question?: string) {
    if (!context || aion.status !== 'ready') return;
    flushWritingDraft();
    // The click can save the active line synchronously before React rerenders.
    // Read the store now so this request includes exactly what is on the page.
    const state = useNotebookStore.getState();
    const currentContext = state.notebook && state.currentPageId
      ? createDocumentContext(state.notebook, state.currentPageId, state.selectedObjectId)
      : null;
    if (!currentContext) return;
    const request = question?.trim() || 'Analyze this page. Separate its problems, explain the important mathematics, and show checkable steps.';
    const turnId = `${Date.now()}-${conversation.length}`;
    const priorConversation = conversation.slice(-3).filter((turn) => turn.answer).map((turn) => (
      `User: ${turn.question}\nAION: ${turn.answer}`
    )).join('\n\n');
    setConversation((current) => [...current, { id: turnId, question: request, answer: '' }]);
    setActiveTurnId(turnId);
    setAionQuestion('');
    setAssistantView('chat');
    aion.analyze(currentContext, priorConversation
      ? `Continue the page-aware conversation below. Resolve references to earlier questions, but recalculate rather than trusting an earlier answer blindly.\n\n${priorConversation}\n\nNew user question:\n${request}`
      : request);
  }

  useEffect(() => {
    const askFromResearch = (event: Event) => {
      const question = (event as CustomEvent<string>).detail;
      if (!question) return;
      openAssistant();
      setAssistantView('chat');
      if (aion.status === 'ready') submitAION(question);
      else setAionQuestion(question);
    };
    window.addEventListener('mathnotebook:aion-question', askFromResearch);
    return () => window.removeEventListener('mathnotebook:aion-question', askFromResearch);
  }, [aion.status, context]);

  function explainGroupWithAION(group: PageProblemGroup, groupIndex: number) {
    if (!context || aion.status !== 'ready') return;
    const lines = group.items.map((item, index) => {
      const value = item.object.type === 'math' ? item.object.latex : item.object.type === 'text' ? item.object.text : item.object.snapshot.title;
      return `${index + 1}. ${item.object.type}: ${value}`;
    }).join('\n');
    submitAION([
      `Solve or analyze only Problem ${groupIndex + 1} below. Do not combine it with other page problems.`,
      'Show a complete sequence of visible, checkable mathematical steps, state assumptions, and verify the final result where possible.',
      lines,
    ].join('\n'));
  }

  function closeAssistant() {
    setOpen(false);
    storeOpenPreference(false);
    normalizeHorizontalScroll();
  }

  function openAssistant() {
    flushWritingDraft();
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
          <span>Structured page context · AION</span>
        </div>
        <div className="page-assistant__header-actions">
          <button type="button" aria-label="Collapse page assistant" onClick={closeAssistant}>›</button>
          <button type="button" aria-label="Close page assistant" onClick={closeAssistant}>×</button>
        </div>
      </header>
      <nav className="page-assistant__views" aria-label="Page assistant views">
        <button
          type="button"
          className={assistantView === 'chat' ? 'is-active' : ''}
          aria-pressed={assistantView === 'chat'}
          onClick={() => setAssistantView('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={assistantView === 'outline' ? 'is-active' : ''}
          aria-pressed={assistantView === 'outline'}
          onClick={() => setAssistantView('outline')}
        >
          Page outline <span>{groups.length}</span>
        </button>
        <em className={`aion-status aion-status--${aion.status}`}>
          {aion.status === 'analyzing' ? 'thinking' : aion.status === 'loading' ? 'starting' : aion.status}
        </em>
      </nav>
      {assistantView === 'chat' && (
        <section className="aion-chat" aria-label="AION mathematical conversation">
          {!window.mathKhataDesktop && (
            <div className="aion-mode-picker" role="radiogroup" aria-label="AION processing mode">
              <div>
                <button
                  type="button"
                  role="radio"
                  aria-checked={aion.provider === 'online'}
                  className={aion.provider === 'online' ? 'is-active' : ''}
                  disabled={aion.status === 'analyzing' || aion.status === 'loading'}
                  onClick={() => aion.setProvider('online')}
                >
                  Fast online
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={aion.provider === 'on-device'}
                  className={aion.provider === 'on-device' ? 'is-active' : ''}
                  disabled={aion.status === 'analyzing' || aion.status === 'loading'}
                  onClick={() => aion.setProvider('on-device')}
                >
                  Private on-device
                </button>
              </div>
              <p>
                {aion.provider === 'online'
                  ? 'AION online · broader capability · fast start · works on mobile · sends this page and question for processing · free daily allowance'
                  : 'AION private model · usable offline after setup · first download is cached by this browser · desktop-grade memory recommended'}
              </p>
            </div>
          )}
          <div
            className="aion-chat__conversation"
            ref={conversationRef}
          >
            {conversation.length === 0 && aion.status !== 'analyzing' && (
              <div className="aion-welcome">
                <span className="aion-mark">A</span>
                <h2>Work through the mathematics on this page</h2>
                <p>Ask for a proof, a symbolic calculation, integration steps, or an explanation of one problem. Notebook content changes only when you choose to insert a result.</p>
                <div className="aion-suggestions">
                  <button type="button" disabled={aion.status !== 'ready'} onClick={() => submitAION()}>Analyze this page</button>
                  <button type="button" disabled={aion.status !== 'ready'} onClick={() => submitAION('Solve every complete problem on this page separately. Show all important mathematical steps and verify each result.')}>Solve page with steps</button>
                  <button type="button" disabled={aion.status !== 'ready'} onClick={() => submitAION('Check the page for incomplete notation or recognition errors. Explain each issue and suggest a mathematically correct replacement.')}>Check notation</button>
                </div>
              </div>
            )}
            {conversation.map((turn) => (
              <div className="aion-turn" key={turn.id}>
                <div className="aion-message aion-message--user"><p>{turn.question}</p></div>
                {turn.answer && (
                  <div className="aion-message aion-message--assistant">
                    <span className="aion-message__name">AION</span>
                    <AIONVisibleAnswer text={turn.answer} />
                    {turn.complete && turn.elapsedSeconds !== undefined && (
                      <span className="aion-message__elapsed">
                        Thought for {formatAIONElapsed(turn.elapsedSeconds)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(aion.status === 'loading' || aion.status === 'analyzing') && (
              <div className="aion-message aion-message--assistant aion-message--progress" role="status">
                <span className="aion-message__name">AION</span>
                <div className="aion-progress__heading">
                  <p>{aion.status === 'analyzing' ? `Working · ${aion.elapsedSeconds} s` : 'Starting AION'}</p>
                  {aion.status === 'analyzing' && (
                    <button type="button" onClick={aion.stop} aria-label="Stop AION generation">
                      Stop generation
                    </button>
                  )}
                </div>
                <p className="aion-progress__detail">{aion.message || 'Working through the mathematics…'}</p>
                <progress max="100" value={aion.progress} />
              </div>
            )}
            {(aion.status === 'idle' || aion.status === 'error') && (
              <div className="aion-message aion-message--assistant aion-message--error" role="status">
                <span className="aion-message__name">AION</span>
                <p>{aion.message || 'AION is unavailable. Notebook editing and the checked local solver remain available.'}</p>
                <button type="button" onClick={aion.enable}>Check AION again</button>
              </div>
            )}
          </div>
          <div className="aion-composer">
            <textarea
              rows={3}
              value={aionQuestion}
              aria-label="Ask AION about this page"
              placeholder="Ask AION about this page…"
              onChange={(event) => setAionQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (aionQuestion.trim()) submitAION(aionQuestion);
                }
              }}
            />
            <div>
              <span>When you send, AION processes this page for the answer; the notebook remains saved locally.</span>
              <button
                type="button"
                aria-label="Send question to AION"
                disabled={aion.status !== 'ready' || !aionQuestion.trim()}
                onClick={() => submitAION(aionQuestion)}
              >
                ↑
              </button>
            </div>
          </div>
        </section>
      )}
      {assistantView === 'outline' && (
        <section className="page-outline" aria-label="Structured page outline">
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
                      : item.object.type === 'text' ? <q>{item.object.text}</q> : <q>{item.object.snapshot.title}</q>}
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
                {(mathCount > 0 || group.kind === 'question') && aion.status === 'ready' && (
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
                  {solveState.result.steps && (
                    <ol className="page-problem__steps">
                      {solveState.result.steps.map((step, index) => (
                        <li key={`${step.label}-${index}`}>
                          <strong>{step.label}</strong>
                          {step.latex && <ReadOnlyMath latex={step.latex} label={step.label} />}
                          {step.text && <p>{step.text}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
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
        </section>
      )}
      <footer>Structured page grouping and checked local mathematics remain available independently.</footer>
    </aside>
  );
}
