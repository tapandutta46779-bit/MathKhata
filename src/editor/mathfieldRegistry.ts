import type { MathfieldElement } from 'mathlive';

interface RegisteredMathfield {
  element: MathfieldElement;
  onValueChange: (value: string) => void;
}

const fields = new Map<string, RegisteredMathfield>();
let activeId: string | null = null;

export function registerMathfield(
  id: string,
  element: MathfieldElement,
  onValueChange: (value: string) => void,
): () => void {
  fields.set(id, { element, onValueChange });
  return () => {
    fields.delete(id);
    if (activeId === id) activeId = null;
  };
}

export function setActiveMathfield(id: string | null): void {
  activeId = id;
}

export function getActiveMathfieldId(): string | null {
  return activeId;
}

export function focusMathfield(id: string): boolean {
  const field = fields.get(id);
  if (!field) return false;
  activeId = id;
  field.element.focus();
  return true;
}

export function blurActiveMathfield(): void {
  if (!activeId) return;
  fields.get(activeId)?.element.blur();
  activeId = null;
}

export function insertIntoMathfield(id: string, latex: string): boolean {
  const field = fields.get(id);
  if (!field) return false;
  activeId = id;
  field.element.focus();
  const inserted = field.element.insert(latex, {
    insertionMode: 'replaceSelection',
    selectionMode: 'placeholder',
  });
  field.onValueChange(field.element.value);
  return inserted;
}

export function insertIntoActiveMathfield(latex: string): boolean {
  return activeId ? insertIntoMathfield(activeId, latex) : false;
}

