import { describe, expect, it } from 'vitest';
import { addObject, createMathObject, createNotebook, createTextObject } from '../src/domain/notebook';
import { deserializeNotebook, NotebookValidationError, serializeNotebook, validateNotebook } from '../src/domain/schema';

describe('structured notebook serialization', () => {
  it('round-trips exact content, spatial data, and schema version', () => {
    let notebook = createNotebook('Exact work');
    const pageId = notebook.pages[0].id;
    notebook = addObject(notebook, pageId, createMathObject({ x: 101, y: 207 }, '\\int_0^2 x^2\\,dx'));
    notebook = addObject(notebook, pageId, createTextObject(
      { x: 445, y: 318 },
      '<b>plain text only</b>',
      {},
      { fontFamily: 'roman', fontSize: 20, bold: true, italic: true, color: '#1d4f91' },
    ));
    const json = serializeNotebook(notebook);
    const restored = deserializeNotebook(json);
    expect(restored).toEqual(notebook);
    expect(restored.pages[0].objects.find((object) => object.type === 'text')).toMatchObject({
      style: { fontFamily: 'roman', fontSize: 20, bold: true, italic: true, color: '#1d4f91' },
    });
    expect(JSON.parse(json)).toMatchObject({
      format: 'mathkhata-notebook',
      schemaVersion: 3,
      notebook: { title: 'Exact work' },
    });
  });

  it('rejects malformed input and unsupported future schema versions', () => {
    expect(() => deserializeNotebook('{broken')).toThrow(NotebookValidationError);
    expect(() => deserializeNotebook(JSON.stringify({ format: 'mathkhata-notebook' }))).toThrow(
      'valid Math Notebook export',
    );
    expect(() => validateNotebook({ ...createNotebook(), schemaVersion: 99 })).toThrow(
      'Unsupported notebook schema version 99',
    );
    expect(() => validateNotebook({ ...createNotebook(), schemaVersion: 0 })).toThrow(
      'has no safe migration',
    );
  });

  it('migrates schema 1 notebooks by adding an empty persistent drawing layer', () => {
    const notebook = createNotebook('Legacy');
    const legacy = {
      ...notebook,
      schemaVersion: 1,
      pages: notebook.pages.map((page) => ({
        id: page.id,
        order: page.order,
        width: page.width,
        height: page.height,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        objects: page.objects,
      })),
    };
    const restored = validateNotebook(legacy);
    expect(restored.schemaVersion).toBe(3);
    expect(restored.pages[0].drawings).toEqual([]);
    expect(restored.pages[0]).toMatchObject({ favorite: false, highlightColor: null });
    expect(restored.research).toEqual({ values: {} });
  });

  it('migrates schema 2 drawings and page metadata without losing content', () => {
    const notebook = createNotebook('Version two');
    const legacy = {
      ...notebook,
      schemaVersion: 2,
      research: undefined,
      pages: notebook.pages.map((page) => ({
        ...page,
        favorite: undefined,
        highlightColor: undefined,
        drawings: [{
          id: 'old-stroke', kind: 'pen', color: '#123456', width: 4, opacity: 1,
          points: [{ x: 2, y: 3 }, { x: 8, y: 9 }], createdAt: page.createdAt, updatedAt: page.updatedAt,
        }],
      })),
    };
    const restored = validateNotebook(legacy);
    expect(restored.schemaVersion).toBe(3);
    expect(restored.pages[0].drawings[0].erasures).toEqual([]);
    expect(restored.pages[0]).toMatchObject({ favorite: false, highlightColor: null });
  });

  it('rejects duplicate object identifiers', () => {
    const notebook = createNotebook('Duplicate safety');
    const page = notebook.pages[0];
    const first = createMathObject({ x: 10, y: 10 }, 'x');
    const second = { ...createTextObject({ x: 30, y: 30 }, 'note'), id: first.id };
    expect(() => validateNotebook({ ...notebook, pages: [{ ...page, objects: [first, second] }] })).toThrow(
      'Notebook data is malformed',
    );
  });
});
