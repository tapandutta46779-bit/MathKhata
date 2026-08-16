import { describe, expect, it } from 'vitest';
import {
  addObject,
  addPage,
  createMathObject,
  createNotebook,
  createTextObject,
  convertMathObjectToText,
  deletePage,
  duplicateObject,
  movePage,
  addDrawing,
  removeDrawing,
  removeObject,
  updateObject,
  eraseDrawingRegions,
  updatePageMetadata,
  deletePages,
  resetPages,
  resetNotebookContent,
  updateResearchValue,
  resetResearchValues,
  createResearchObject,
} from '../src/domain/notebook';
import { DEFAULT_PAGE_HEIGHT, DEFAULT_PAGE_WIDTH, SCHEMA_VERSION } from '../src/domain/model';

function deterministicFactories() {
  let id = 0;
  return {
    id: () => `id-${++id}`,
    now: () => '2026-08-07T00:00:00.000Z',
  };
}

describe('notebook domain', () => {
  it('creates a versioned notebook with one ordered page', () => {
    const notebook = createNotebook('Algebra', deterministicFactories());
    expect(notebook).toMatchObject({
      id: 'id-1',
      schemaVersion: SCHEMA_VERSION,
      title: 'Algebra',
    });
    expect(notebook.pages).toHaveLength(1);
    expect(notebook.pages[0]).toMatchObject({
      id: 'id-2',
      order: 0,
      width: DEFAULT_PAGE_WIDTH,
      height: DEFAULT_PAGE_HEIGHT,
      objects: [],
    });
  });

  it('creates, reorders, and deletes pages without allowing a zero-page notebook', () => {
    const factories = deterministicFactories();
    const initial = createNotebook('Calculus', factories);
    const withThree = addPage(addPage(initial, factories), factories);
    expect(withThree.pages.map((page) => page.order)).toEqual([0, 1, 2]);
    const lastId = withThree.pages[2].id;
    const moved = movePage(withThree, lastId, -1, factories.now);
    expect(moved.pages[1].id).toBe(lastId);
    const afterDelete = deletePage(moved, lastId, factories.now);
    expect(afterDelete.pages).toHaveLength(2);
    expect(afterDelete.pages.map((page) => page.order)).toEqual([0, 1]);
    const onePage = deletePage(afterDelete, afterDelete.pages[1].id, factories.now);
    expect(deletePage(onePage, onePage.pages[0].id, factories.now)).toBe(onePage);
  });

  it('creates and updates structured math and text objects with coordinates', () => {
    const factories = deterministicFactories();
    const initial = createNotebook('Objects', factories);
    const pageId = initial.pages[0].id;
    const math = createMathObject({ x: 84, y: 120 }, 'x^2', factories);
    const text = createTextObject({ x: 380, y: 250 }, 'side note', factories);
    let notebook = addObject(initial, pageId, math, factories.now);
    notebook = addObject(notebook, pageId, text, factories.now);
    expect(notebook.pages[0].objects).toEqual([
      expect.objectContaining({ type: 'math', x: 84, y: 120, latex: 'x^2' }),
      expect.objectContaining({ type: 'text', x: 380, y: 250, text: 'side note' }),
    ]);
    notebook = updateObject(notebook, pageId, math.id, { latex: '\\frac{1}{2}', x: 140, y: 180 }, factories.now);
    expect(notebook.pages[0].objects[0]).toMatchObject({ latex: '\\frac{1}{2}', x: 140, y: 180 });
    notebook = updateObject(notebook, pageId, text.id, { text: 'corrected thought' }, factories.now);
    expect(notebook.pages[0].objects[1]).toMatchObject({ text: 'corrected thought' });
  });

  it('duplicates and removes an object without mutating the original', () => {
    const factories = deterministicFactories();
    const initial = createNotebook('History', factories);
    const pageId = initial.pages[0].id;
    const math = createMathObject({ x: 20, y: 20 }, 'y=mx+b', factories);
    const withMath = addObject(initial, pageId, math, factories.now);
    const duplicated = duplicateObject(withMath, pageId, math.id, factories);
    expect(duplicated.objectId).not.toBe(math.id);
    expect(duplicated.notebook.pages[0].objects).toHaveLength(2);
    expect(duplicated.notebook.pages[0].objects[1]).toMatchObject({ x: 44, y: 44, latex: 'y=mx+b' });
    const removed = removeObject(duplicated.notebook, pageId, math.id, factories.now);
    expect(removed.pages[0].objects).toHaveLength(1);
    expect(withMath.pages[0].objects).toHaveLength(1);
  });

  it('converts a reviewed Math object to Text only after an explicit command', () => {
    const factories = deterministicFactories();
    const initial = createNotebook('Voice repair', factories);
    const pageId = initial.pages[0].id;
    const math = createMathObject({ x: 82, y: 20 }, '\\operatorname{why}=0', factories);
    const withMath = addObject(initial, pageId, math, factories.now);
    const converted = convertMathObjectToText(withMath, pageId, math.id, 'why = 0', factories.now);

    expect(converted.pages[0].objects[0]).toMatchObject({
      id: math.id,
      type: 'text',
      text: 'why = 0',
      x: 82,
      y: 20,
    });
    expect(withMath.pages[0].objects[0].type).toBe('math');
  });

  it('persists and removes page drawings without changing notebook objects', () => {
    const factories = deterministicFactories();
    const initial = createNotebook('Sketch', factories);
    const pageId = initial.pages[0].id;
    const drawing = {
      id: 'stroke-1',
      kind: 'pen' as const,
      color: '#2f2d29',
      width: 3,
      opacity: 1,
      points: [{ x: 90, y: 90 }, { x: 130, y: 120 }],
      erasures: [],
      createdAt: factories.now(),
      updatedAt: factories.now(),
    };
    const withDrawing = addDrawing(initial, pageId, drawing, factories.now);
    expect(withDrawing.pages[0].drawings).toEqual([drawing]);
    expect(withDrawing.pages[0].objects).toEqual([]);
    expect(removeDrawing(withDrawing, pageId, drawing.id, factories.now).pages[0].drawings).toEqual([]);
  });

  it('records a partial eraser path only on the drawings it intersects', () => {
    const factories = deterministicFactories();
    const initial = createNotebook('Partial erase', factories);
    const pageId = initial.pages[0].id;
    const first = { id: 'first', kind: 'pen' as const, color: '#111', width: 3, opacity: 1, points: [{ x: 10, y: 10 }, { x: 100, y: 10 }], erasures: [], createdAt: factories.now(), updatedAt: factories.now() };
    const second = { ...first, id: 'second', points: [{ x: 10, y: 80 }, { x: 100, y: 80 }] };
    const drawn = addDrawing(addDrawing(initial, pageId, first, factories.now), pageId, second, factories.now);
    const erasure = { id: 'erase-1', width: 24, points: [{ x: 45, y: 5 }, { x: 55, y: 15 }], createdAt: factories.now() };
    const erased = eraseDrawingRegions(drawn, pageId, ['first'], erasure, factories.now);
    expect(erased.pages[0].drawings).toHaveLength(2);
    expect(erased.pages[0].drawings[0].erasures).toEqual([erasure]);
    expect(erased.pages[0].drawings[1].erasures).toEqual([]);
    expect(drawn.pages[0].drawings[0].erasures).toEqual([]);
  });

  it('updates page markers, bulk resets/deletes in order, and resets only the current notebook', () => {
    const factories = deterministicFactories();
    let notebook = addPage(addPage(createNotebook('Pages', factories), factories), factories);
    const ids = notebook.pages.map((page) => page.id);
    notebook = updatePageMetadata(notebook, [ids[0], ids[2]], { favorite: true, highlightColor: '#ffee88' }, factories.now);
    expect(notebook.pages.map((page) => page.favorite)).toEqual([true, false, true]);
    const math = createMathObject({ x: 20, y: 30 }, 'x^2', factories);
    notebook = addObject(notebook, ids[0], math, factories.now);
    const reset = resetPages(notebook, [ids[0]], factories.now);
    expect(reset.pages[0].objects).toEqual([]);
    expect(reset.pages[0]).toMatchObject({ id: ids[0], favorite: true, highlightColor: '#ffee88' });
    const deleted = deletePages(reset, [ids[1]], factories);
    expect(deleted.pages.map((page) => page.id)).toEqual([ids[0], ids[2]]);
    expect(deleted.pages.map((page) => page.order)).toEqual([0, 1]);
    const blank = resetNotebookContent(deleted, factories);
    expect(blank.title).toBe('Pages');
    expect(blank.pages).toHaveLength(1);
  });

  it('stores research state and independent page snapshots in schema version 3', () => {
    const factories = deterministicFactories();
    const initial = createNotebook('Research', factories);
    const withGraph = updateResearchValue(initial, '2d:expressions', [{ expression: 'x^2' }], factories.now);
    const snapshot = createResearchObject({ x: 50, y: 70 }, {
      kind: '2d', title: '2D Graph', values: { '2d:expressions': [{ expression: 'x^2' }] }, previewDataUrl: 'data:image/png;base64,AA==',
    }, factories);
    const withSnapshot = addObject(withGraph, withGraph.pages[0].id, snapshot, factories.now);
    const resetSource = resetResearchValues(withSnapshot, ['2d:'], factories.now);
    expect(resetSource.research.values).toEqual({});
    expect(resetSource.pages[0].objects[0]).toMatchObject({ type: 'research', snapshot: { values: { '2d:expressions': [{ expression: 'x^2' }] } } });
    const logSnapshot = createResearchObject({ x: 80, y: 90 }, {
      kind: 'loglog', title: 'Log-Log Graph', values: { 'loglog:expressions': [{ expression: 'y=x^2' }] }, previewDataUrl: null,
    }, factories);
    expect(logSnapshot.snapshot.kind).toBe('loglog');
  });
});
