import { useState } from 'react';
import { MATH_PALETTE_CATEGORIES } from '../domain/mathNotation';
import type { MathObject } from '../domain/model';
import { focusMathfield, insertIntoMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';

function selectedMathObject(): MathObject | null {
  const state = useNotebookStore.getState();
  const object = state.notebook
    ?.pages.find((page) => page.id === state.currentPageId)
    ?.objects.find((candidate) => candidate.id === state.selectedObjectId);
  return object?.type === 'math' ? object : null;
}

function insertTemplate(template: string) {
  const state = useNotebookStore.getState();
  const selected = selectedMathObject();
  if (selected && insertIntoMathfield(selected.id, template)) return;
  const id = state.createObject('math', state.insertionPoint);
  if (id) {
    requestAnimationFrame(() => {
      focusMathfield(id);
      insertIntoMathfield(id, template);
    });
  }
}

export function MathPalette() {
  const [categoryId, setCategoryId] = useState('basic');
  const open = useNotebookStore((state) => state.paletteOpen);
  const setOpen = useNotebookStore((state) => state.setPaletteOpen);
  if (!open) return null;
  const category = MATH_PALETTE_CATEGORIES.find((item) => item.id === categoryId) ?? MATH_PALETTE_CATEGORIES[0];

  return (
    <section className="math-palette" aria-label="Mathematical symbol palette" data-testid="math-palette">
      <div className="palette-header">
        <div>
          <strong>Symbols</strong>
          <span>Insert at the active caret</span>
        </div>
        <button type="button" aria-label="Close symbol palette" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div className="palette-body">
        <div className="palette-tabs" role="tablist" aria-label="Symbol categories">
          {MATH_PALETTE_CATEGORIES.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={item.id === category.id}
              className={item.id === category.id ? 'is-active' : ''}
              key={item.id}
              onClick={() => setCategoryId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="palette-grid" role="tabpanel">
          {category.items.map((item) => (
            <button
              type="button"
              className="palette-key"
              key={`${category.id}-${item.label}`}
              aria-label={`Insert ${item.label}`}
              title={item.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertTemplate(item.template)}
            >
              {item.visual}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
