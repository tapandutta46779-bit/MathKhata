import { describe, expect, it } from 'vitest';
import { addObject, createMathObject, createNotebook, createTextObject } from '../src/domain/notebook';
import { deserializeNotebook, NotebookValidationError, serializeNotebook, validateNotebook } from '../src/domain/schema';

describe('structured notebook serialization', () => {
  it('round-trips exact content, spatial data, and schema version', () => {
    let notebook = createNotebook('Exact work');
    const pageId = notebook.pages[0].id;
    notebook = addObject(notebook, pageId, createMathObject({ x: 101, y: 207 }, '\\int_0^2 x^2\\,dx'));
    notebook = addObject(notebook, pageId, createTextObject({ x: 445, y: 318 }, '<b>plain text only</b>'));
    const json = serializeNotebook(notebook);
    const restored = deserializeNotebook(json);
    expect(restored).toEqual(notebook);
    expect(JSON.parse(json)).toMatchObject({
      format: 'mathkhata-notebook',
      schemaVersion: 1,
      notebook: { title: 'Exact work' },
    });
  });

  it('rejects malformed input and unsupported future schema versions', () => {
    expect(() => deserializeNotebook('{broken')).toThrow(NotebookValidationError);
    expect(() => deserializeNotebook(JSON.stringify({ format: 'mathkhata-notebook' }))).toThrow(
      'valid MathKhata notebook export',
    );
    expect(() => validateNotebook({ ...createNotebook(), schemaVersion: 99 })).toThrow(
      'Unsupported notebook schema version 99',
    );
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

