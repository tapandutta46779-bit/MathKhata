import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addObject, createMathObject, createNotebook, updateObject } from '../src/domain/notebook';
import {
  database,
  listNotebooks,
  loadMostRecentNotebook,
  loadNotebook,
  saveNotebook,
} from '../src/persistence/database';

describe('IndexedDB persistence', () => {
  beforeEach(async () => {
    database.close();
    await database.delete();
    await database.open();
  });

  afterAll(async () => {
    database.close();
    await database.delete();
  });

  it('creates, lists, and reopens a notebook', async () => {
    const notebook = createNotebook('Persistent work');
    await saveNotebook(notebook);
    expect(await loadNotebook(notebook.id)).toEqual(notebook);
    expect(await loadMostRecentNotebook()).toEqual(notebook);
    expect(await listNotebooks()).toEqual([
      expect.objectContaining({ id: notebook.id, title: 'Persistent work', pageCount: 1 }),
    ]);
  });

  it('preserves exact mathematics after a simulated reload', async () => {
    let notebook = createNotebook('Reload proof');
    const pageId = notebook.pages[0].id;
    const math = createMathObject({ x: 132, y: 244 }, '\\frac{x^2+1}{\\sqrt{y}}');
    notebook = addObject(notebook, pageId, math);
    notebook = updateObject(notebook, pageId, math.id, { x: 281, y: 377 });
    await saveNotebook(notebook);

    database.close();
    await database.open();
    const restored = await loadNotebook(notebook.id);
    expect(restored?.pages[0].objects[0]).toMatchObject({
      type: 'math',
      latex: '\\frac{x^2+1}{\\sqrt{y}}',
      x: 281,
      y: 377,
    });
  });
});

