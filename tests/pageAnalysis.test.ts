import { describe, expect, it } from 'vitest';
import {
  analyzeNotebookPage,
  confirmProblemGroup,
  joinProblemWithPrevious,
  readableMathText,
  splitProblemGroup,
} from '../src/assistant/pageAnalysis';
import { solvePageProblem } from '../src/assistant/pageProblemSolver';
import {
  addObject,
  createMathObject,
  createNotebook,
  createTextObject,
} from '../src/domain/notebook';
import { createDocumentContext } from '../src/extensions/providers';
import type { Notebook } from '../src/domain/model';
import { createAIONPagePrompt } from '../src/aion/runtime';

function pageWith(
  entries: Array<{ type: 'math' | 'text'; content: string; x?: number; y: number }>,
): { notebook: Notebook; pageId: string } {
  let serial = 0;
  const factory = {
    id: () => `page-analysis-${++serial}`,
    now: () => '2026-08-07T00:00:00.000Z',
  };
  let notebook = createNotebook('Analysis', factory);
  const pageId = notebook.pages[0].id;
  for (const entry of entries) {
    const point = { x: entry.x ?? 82, y: entry.y };
    const object = entry.type === 'math'
      ? createMathObject(point, entry.content, factory)
      : createTextObject(point, entry.content, factory);
    notebook = addObject(notebook, pageId, object, factory.now);
  }
  return { notebook, pageId };
}

function analyze(entries: Parameters<typeof pageWith>[0]) {
  const { notebook, pageId } = pageWith(entries);
  const context = createDocumentContext(notebook, pageId, null);
  if (!context) throw new Error('Expected page context');
  return analyzeNotebookPage(context);
}

describe('whole-page structured analysis', () => {
  it('includes unfinished writing in both the outline and AION without changing the saved page', () => {
    const notebook = createNotebook();
    const pageId = notebook.pages[0].id;
    const pending = createMathObject({ x: 82, y: 20 }, 'x^2+3x=4');
    const context = createDocumentContext(notebook, pageId, null, [], [pending])!;
    expect(analyzeNotebookPage(context).groups[0]).toMatchObject({ kind: 'question' });
    expect(createAIONPagePrompt(context)).toContain('x^2+3x=4');
    expect(context.previousEquations).toContain(pending);
    expect(notebook.pages[0].objects).toHaveLength(0);
  });

  it('recognizes problems written in Text mode and ignores empty fields', () => {
    const result = analyze([
      { type: 'math', content: '', y: 20 },
      { type: 'text', content: 'Solve x^2+3x=4', y: 64 },
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].kind).toBe('question');
    expect(result.groups[0].items[0].object.type).toBe('text');
    expect(analyze([{ type: 'text', content: 'Remember the boundary conditions.', y: 20 }]).groups[0].kind).toBe('notes');
  });

  it('keeps explicitly numbered questions separate in ruled-line order', () => {
    const result = analyze([
      { type: 'text', content: 'Problem 1', y: 20 },
      { type: 'math', content: 'x^2=4', y: 64 },
      { type: 'text', content: 'Problem 2', y: 108 },
      { type: 'math', content: 'y+3=8', y: 152 },
    ]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.heading)).toEqual(['Problem 1', 'Problem 2']);
    expect(result.orderedObjectIds).toHaveLength(4);
  });

  it('recognizes a transitive related equation system and keeps its note', () => {
    const result = analyze([
      { type: 'math', content: 'x^2=1', y: 20 },
      { type: 'math', content: 'y^2=6', y: 64 },
      { type: 'math', content: 'x^2+y^2=7', y: 108 },
      { type: 'text', content: 'These lines describe the same curve comparison.', y: 152 },
    ]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ kind: 'system', needsReview: true });
    expect(result.groups[0].items.map((item) => item.object.type)).toEqual(['math', 'math', 'math', 'text']);
  });

  it('does not silently combine nearby independent questions', () => {
    const result = analyze([
      { type: 'math', content: 'a=1', y: 20 },
      { type: 'math', content: 'x=2', y: 64 },
    ]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.every((group) => group.needsReview)).toBe(true);
    expect(result.groups.every((group) => group.kind === 'question')).toBe(true);
  });

  it('flags voice-corrupted Math lines and offers readable Text content', () => {
    const result = analyze([
      { type: 'math', content: '\\operatorname{why}+x=5y', y: 20 },
      { type: 'math', content: 'why=0', y: 64 },
    ]);

    expect(result.groups.every((group) => group.kind === 'review')).toBe(true);
    expect(result.groups.flatMap((group) => group.items).every((item) => item.suspicious)).toBe(true);
    expect(readableMathText('\\operatorname{why}+x=5y')).toContain('why');
  });

  it('supports explicit split, join, and confirmation without changing page objects', () => {
    const initial = analyze([
      { type: 'text', content: 'System of equations', y: 20 },
      { type: 'math', content: 'x+y=3', y: 64 },
      { type: 'math', content: 'x-y=1', y: 108 },
    ]).groups;
    const split = splitProblemGroup(initial, initial[0].id);
    expect(split).toHaveLength(2);
    const joined = joinProblemWithPrevious(split, split[1].id);
    expect(joined).toHaveLength(1);
    expect(joined[0].kind).toBe('system');
    expect(confirmProblemGroup(joined, joined[0].id)[0].confidence).toBe(1);
  });

  it('solves a confirmed multi-equation group locally', async () => {
    const group = analyze([
      { type: 'text', content: 'System of equations', y: 20 },
      { type: 'math', content: 'x+y=3', y: 64 },
      { type: 'math', content: 'x-y=1', y: 108 },
    ]).groups[0];
    const result = await solvePageProblem(group);

    expect(result.label).toBe('System solution');
    expect(result.resultLatex).toContain('x&=2');
    expect(result.resultLatex).toContain('y&=1');
  });
});
