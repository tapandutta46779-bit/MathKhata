import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { MathfieldElement } from 'mathlive';
import {
  appendCalculatedResult,
  quickCalculate,
} from '../assistant/quickCalculate';
import type { MathObject } from '../domain/model';
import {
  layoutMathOnRuledLines,
  unwrapAutomaticMathLayout,
} from '../domain/mathLineFlow';
import {
  dismissMathfieldMenuFromOutsidePointer,
  dismissMathfieldMenu,
  focusMathfieldElement,
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
    (value: string) => updateMath(object.id, unwrapAutomaticMathLayout(value)),
    [object.id, updateMath],
  );

  const applyLineLayout = useCallback((field: MathfieldElement, semanticLatex: string) => {
    const currentSemantic = field.dataset.autoMultiline === 'true'
      ? unwrapAutomaticMathLayout(field.value)
      : field.value;
    const layout = layoutMathOnRuledLines(semanticLatex);
    const shouldReplace = currentSemantic !== semanticLatex
      || (layout.automatic && field.dataset.autoMultiline !== 'true')
      || (!layout.automatic && field.dataset.autoMultiline === 'true')
      || Number(field.dataset.lineCount ?? '1') !== layout.lineCount;
    if (!shouldReplace) return;
    const wasAtEnd = field.position === field.lastOffset;
    field.value = layout.latex;
    field.dataset.autoMultiline = String(layout.automatic);
    field.dataset.lineCount = String(layout.lineCount);
    if (wasAtEnd) field.position = field.lastOffset;
  }, []);

  const setRef = useCallback(
    (element: Element | null) => {
      fieldRef.current = element as MathfieldElement | null;
      if (!fieldRef.current) return;
      fieldRef.current.smartFence = object.editor.smartFence;
      fieldRef.current.mathVirtualKeyboardPolicy = 'manual';
      window.mathVirtualKeyboard.layouts = ['numeric', 'symbols', 'alphabetic', 'greek'];
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
        focusMathfieldElement(field);
        setActiveMathfield(object.id);
      }
    };
    const handleInput = () => {
      const wasAtEnd = field.position === field.lastOffset;
      const semanticLatex = unwrapAutomaticMathLayout(field.value);
      queueMicrotask(() => {
        handleValueChange(semanticLatex);
        const layout = layoutMathOnRuledLines(semanticLatex);
        if (
          wasAtEnd &&
          ((layout.automatic && field.dataset.autoMultiline !== 'true')
            || (!layout.automatic && field.dataset.autoMultiline === 'true')
            || Number(field.dataset.lineCount ?? '1') !== layout.lineCount)
        ) {
          field.value = layout.latex;
          field.dataset.autoMultiline = String(layout.automatic);
          field.dataset.lineCount = String(layout.lineCount);
          field.position = field.lastOffset;
        }
      });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event as KeyboardEvent & { __mathKhataMenuDismissal?: boolean })
        .__mathKhataMenuDismissal) return;
      if (event.key === 'Escape' && dismissMathfieldMenu(field)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        queueMicrotask(() => focusMathfieldElement(field));
        return;
      }
      if (
        (event.key === ' ' || event.key === 'Spacebar') &&
        document.activeElement === field
      ) {
        // Space belongs to the active math editor, never to the scrollable
        // canvas. Run MathLive's structural move ourselves and stop both its
        // delegated keybinding and the browser's page-scroll default.
        const canvas = field.closest<HTMLElement>('.canvas-scroll');
        const scrollTop = canvas?.scrollTop;
        const scrollLeft = canvas?.scrollLeft;
        event.preventDefault();
        event.stopImmediatePropagation();
        field.executeCommand('moveAfterParent');
        if (canvas && scrollTop !== undefined && scrollLeft !== undefined) {
          canvas.scrollTo({ top: scrollTop, left: scrollLeft });
          requestAnimationFrame(() => canvas.scrollTo({ top: scrollTop, left: scrollLeft }));
        }
        return;
      }
      if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        field.executeCommand(
          event.key === 'ArrowLeft' ? 'moveToPreviousChar' : 'moveToNextChar',
        );
        return;
      }
      if (event.key !== 'Tab') return;
      if (
        !event.shiftKey &&
        field.selectionIsCollapsed &&
        field.position === field.lastOffset
      ) {
        const semanticLatex = unwrapAutomaticMathLayout(field.value);
        const result = quickCalculate(semanticLatex);
        if (result) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const nextLatex = appendCalculatedResult(semanticLatex, result);
          const layout = layoutMathOnRuledLines(nextLatex);
          field.value = layout.latex;
          field.dataset.autoMultiline = String(layout.automatic);
          field.dataset.lineCount = String(layout.lineCount);
          field.position = field.lastOffset;
          handleValueChange(nextLatex);
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        // At the visual end of a superscript, denominator, or similar branch,
        // MathLive's generic next-group command tabs out to the next page
        // button. Leave the parent branch first and keep notebook typing active.
        field.executeCommand('moveAfterParent');
        focusMathfieldElement(field);
        return;
      }
      if (
        event.shiftKey &&
        field.selectionIsCollapsed &&
        field.position === 0
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        field.executeCommand('moveBeforeParent');
        focusMathfieldElement(field);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      // MathLive may return false even after moving out of a structured group.
      // Always consume this Tab so its native handler does not run the same
      // command a second time and turn the whole expression into a selection.
      field.executeCommand(
        event.shiftKey ? 'moveToPreviousGroup' : 'moveToNextGroup',
      );
      if (!field.selectionIsCollapsed) {
        const selectedValue = field.getValue(field.selection);
        if (!selectedValue.includes('\\placeholder')) {
          // MathLive deliberately selects a completed surd/parent group.
          // Notebook Tab semantics are caret navigation, so collapse that
          // completed structural selection just outside the group. Placeholder
          // selections remain selected so the next keystroke fills them.
          const offsets = field.selection.ranges.flatMap(([from, to]) => [from, to]);
          field.position = event.shiftKey
            ? Math.min(...offsets)
            : Math.max(...offsets);
        }
      }
    };
    const handleShadowPointerDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const insideMenu = target.closest('menu[role="menu"]');
      // MathLive mounts its menu scrim under the toggle. Do not mistake a
      // command inside that subtree for a second activation of the toggle.
      const menuToggle = insideMenu
        ? null
        : target.closest('[part~="menu-toggle"]');
      const repeatedSubmenu = target.closest('[role="menuitem"][aria-expanded="true"]');
      if (!menuToggle && !repeatedSubmenu) return;
      if (!dismissMathfieldMenu(field)) {
        if (menuToggle) {
          // The menu button can be activated after an outside click has
          // blurred the field. Restore this field as MathLive's command target
          // before its native pointer handler opens the Insert menu.
          focusMathfieldElement(field);
          setSelectedObject(object.id);
          setEditingObject(object.id);
          setActiveMathfield(object.id);
        }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      queueMicrotask(() => focusMathfieldElement(field));
    };
    const handleShadowKeyUp = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      // Chromium consumes Escape's keydown while a manual popover is in the
      // top layer, but still delivers keyup to the MathLive shadow tree.
      if (keyboardEvent.key !== 'Escape' || !dismissMathfieldMenu(field)) return;
      keyboardEvent.preventDefault();
      keyboardEvent.stopImmediatePropagation();
      queueMicrotask(() => focusMathfieldElement(field));
    };
    const handleDocumentPointerDown = (event: PointerEvent) => {
      // MathLive's native outside-click path can remain in its transient
      // "open" state after repeated submenu cycles. Close through the same
      // private Escape path while allowing the outside activation to proceed.
      dismissMathfieldMenuFromOutsidePointer(field, event);
    };
    const handleFocus = () => {
      setSelectedObject(object.id);
      setEditingObject(object.id);
      setActiveMathfield(object.id);
    };
    const handleBlur = () => {
      // A late blur from the previously active field must not erase ownership
      // that a newly created field has already claimed.
      if (useNotebookStore.getState().editingObjectId === object.id) {
        setEditingObject(null);
      }
    };
    field.addEventListener('mount', activate);
    field.addEventListener('input', handleInput);
    field.addEventListener('keydown', handleKeyDown, true);
    field.addEventListener('focus', handleFocus);
    field.addEventListener('blur', handleBlur);
    field.shadowRoot?.addEventListener('keydown', handleKeyDown as EventListener, true);
    field.shadowRoot?.addEventListener('pointerdown', handleShadowPointerDown, true);
    document.addEventListener('keyup', handleShadowKeyUp, true);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    const readyTimer = setTimeout(activate, 120);
    return () => {
      clearTimeout(readyTimer);
      field.removeEventListener('mount', activate);
      field.removeEventListener('input', handleInput);
      field.removeEventListener('keydown', handleKeyDown, true);
      field.removeEventListener('focus', handleFocus);
      field.removeEventListener('blur', handleBlur);
      field.shadowRoot?.removeEventListener('keydown', handleKeyDown as EventListener, true);
      field.shadowRoot?.removeEventListener('pointerdown', handleShadowPointerDown, true);
      document.removeEventListener('keyup', handleShadowKeyUp, true);
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      unregister();
    };
  }, [handleValueChange, object.id, setEditingObject, setSelectedObject]);

  useEffect(() => {
    const field = fieldRef.current;
    if (field) applyLineLayout(field, object.latex);
  }, [applyLineLayout, object.latex]);

  return (
    <math-field
      ref={setRef}
      class="math-editor"
      style={{ height: object.height }}
      data-testid={`math-field-${object.id}`}
      aria-label="Editable mathematical expression"
    />
  );
}
