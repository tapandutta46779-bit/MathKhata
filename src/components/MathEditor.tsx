import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const unregister = registerMathfield(object.id, field, handleValueChange);
    const activate = () => {
      field.dataset.ready = 'true';
      if (useNotebookStore.getState().editingObjectId === object.id) {
        field.focus();
        setActiveMathfield(object.id);
      }
    };
    const handleInput = () => queueMicrotask(() => handleValueChange(field.value));
    const handleFocus = () => {
      setSelectedObject(object.id);
      setEditingObject(object.id);
      setActiveMathfield(object.id);
    };
    const handleBlur = () => setEditingObject(null);
    field.addEventListener('mount', activate);
    field.addEventListener('input', handleInput);
    field.addEventListener('focus', handleFocus);
    field.addEventListener('blur', handleBlur);
    const readyTimer = setTimeout(activate, 120);
    return () => {
      clearTimeout(readyTimer);
      field.removeEventListener('mount', activate);
      field.removeEventListener('input', handleInput);
      field.removeEventListener('focus', handleFocus);
      field.removeEventListener('blur', handleBlur);
      unregister();
    };
  }, [handleValueChange, object.id, setEditingObject, setSelectedObject]);

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
    />
  );
}
