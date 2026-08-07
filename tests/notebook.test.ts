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
  removeObject,
  updateObject,
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
});
