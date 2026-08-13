import type { MathfieldElement } from 'mathlive';

interface RegisteredMathfield {
  element: MathfieldElement;
  onValueChange: (value: string) => void;
}

const fields = new Map<string, RegisteredMathfield>();
let activeId: string | null = null;

function rootMathMenu(element: MathfieldElement): HTMLElement | null {
  const menus = element.shadowRoot?.querySelectorAll<HTMLElement>('menu[role="menu"]');
  if (!menus) return null;
  return Array.from(menus).find(
    (menu) =>
      menu.parentElement?.getAttribute('role') === 'presentation' &&
      menu.checkVisibility(),
  ) ?? null;
}

export function dismissMathfieldMenu(element: MathfieldElement): boolean {
  const menu = rootMathMenu(element);
  const scrim = menu?.parentElement;
  if (!menu || !scrim) return false;
  // Route a private Escape event directly to MathLive's scrim. A synthetic
  // outside pointer-up is unreliable while MathLive's menu is still in its
  // short "open" state; its keyboard handler closes every state consistently.
  // Keep the event inside the shadow root so App's global shortcut does not
  // see the synthetic dismissal and recurse.
  const dismissal = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
    composed: false,
  });
  Object.defineProperty(dismissal, '__mathKhataMenuDismissal', { value: true });
  scrim.dispatchEvent(dismissal);
  return true;
}

export function dismissActiveMathfieldMenu(): boolean {
  if (activeId) {
    const active = fields.get(activeId)?.element;
    if (active && dismissMathfieldMenu(active)) return true;
  }
  // A menu activation can move DOM focus just before Escape arrives. Search
  // the small registry as a fallback so the open menu still owns that key.
  for (const field of fields.values()) {
    if (dismissMathfieldMenu(field.element)) return true;
  }
  return false;
}

export function dismissMathfieldMenuFromOutsidePointer(
  element: MathfieldElement,
  event: PointerEvent,
): boolean {
  if (!rootMathMenu(element)) return false;
  const path = event.composedPath();
  const belongsToMenu = path.some((node) =>
    node instanceof Element && (
      node.matches('menu[role="menu"]') ||
      node.matches('[part~="menu-toggle"]')
    ));
  if (belongsToMenu) return false;
  return dismissMathfieldMenu(element);
}

export function focusMathfieldElement(element: MathfieldElement): void {
  element.focus();
  // MathLive normally transfers focus to its keyboard sink on a short timer.
  // Focusing that sink now closes the small window where Space/arrow/Tab keys
  // would otherwise still belong to the scrolling page.
  element.shadowRoot
    ?.querySelector<HTMLElement>('[part~="keyboard-sink"]')
    ?.focus({ preventScroll: true });
}

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
  focusMathfieldElement(field.element);
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
  focusMathfieldElement(field.element);
  field.element.insert(latex, {
    insertionMode: 'replaceSelection',
    selectionMode: 'placeholder',
  });
  field.onValueChange(field.element.value);
  // MathLive can return false for complex templates (notably matrices) even
  // after it accepted and rendered them. This boolean means the target field
  // was found and handled, so callers must not create a second math object.
  return true;
}

export function insertIntoActiveMathfield(latex: string): boolean {
  return activeId ? insertIntoMathfield(activeId, latex) : false;
}

export function showActiveMathfieldMenu(): boolean {
  const field = activeId ? fields.get(activeId)?.element : null;
  if (!field) return false;
  focusMathfieldElement(field);
  const bounds = field.getBoundingClientRect();
  return field.showMenu({
    location: { x: bounds.left + 18, y: bounds.bottom },
    modifiers: { alt: false, control: false, meta: false, shift: false },
  });
}

export function focusActiveMathfield(): boolean {
  const field = activeId ? fields.get(activeId)?.element : null;
  if (!field) return false;
  focusMathfieldElement(field);
  return true;
}
