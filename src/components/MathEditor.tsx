import { useCallback, useEffect, useRef } from 'react';
import { MathfieldElement } from 'mathlive';
import type { MathObject } from '../domain/model';
import {
  registerMathfield,
  setActiveMathfield,
} from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';

interface MathEditorProps {
  object: MathObject;
}

export function MathEditor({ object }: MathEditorProps) {
  const fieldRef = useRef<MathfieldElement | null>(null);
  const updateMath = useNotebookStore((state) => state.updateMath);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const setEditingObject = useNotebookStore((state) => state.setEditingObject);

  const handleValueChange = useCallback(
    (value: string) => updateMath(object.id, value),
    [object.id, updateMath],
  );

  const setRef = useCallback(
    (element: Element | null) => {
      fieldRef.current = element as MathfieldElement | null;
      if (!fieldRef.current) return;
      fieldRef.current.smartFence = object.editor.smartFence;
      fieldRef.current.mathVirtualKeyboardPolicy = 'manual';
    },
    [object.editor.smartFence],
  );

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    return registerMathfield(object.id, field, handleValueChange);
  }, [handleValueChange, object.id]);

  useEffect(() => {
    const field = fieldRef.current;
    if (field && field.value !== object.latex) field.value = object.latex;
  }, [object.latex]);

  return (
    <math-field
      ref={setRef}
      class="math-editor"
      data-testid={`math-field-${object.id}`}
      aria-label="Editable mathematical expression"
      onInput={(event) => handleValueChange((event.currentTarget as MathfieldElement).value)}
      onFocus={() => {
        setSelectedObject(object.id);
        setEditingObject(object.id);
        setActiveMathfield(object.id);
      }}
      onBlur={() => setEditingObject(null)}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}

