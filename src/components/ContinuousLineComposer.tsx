import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import type { Page } from '../domain/model';
import { interpretTypedLine, type LineIntentMode } from '../domain/lineIntent';
import { WRITING_LEFT, WRITING_LINE_HEIGHT } from '../domain/writingFlow';
import { registerMathfield, setActiveMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';

export type WritingMode = LineIntentMode;

interface ContinuousLineComposerProps {
  page: Page;
  mode: WritingMode;
}

export function ContinuousLineComposer({ page, mode }: ContinuousLineComposerProps) {
  const [value, setValue] = useState('');
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const mathRef = useRef<MathfieldElement | null>(null);
  const unregisterMathRef = useRef<(() => void) | null>(null);
  const tool = useNotebookStore((state) => state.tool);
  const insertionPoint = useNotebookStore((state) => state.insertionPoint);
  const createMixedLine = useNotebookStore((state) => state.createMixedLine);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const setEditingObject = useNotebookStore((state) => state.setEditingObject);
  const interpretation = useMemo(() => interpretTypedLine(value, mode), [mode, value]);
  const lineIsOccupied = page.objects.some(
    (object) => Math.abs(object.y - insertionPoint.y) < WRITING_LINE_HEIGHT * 0.45,
  );

  const attachMathfield = useCallback((element: MathfieldElement | null) => {
    if (element === mathRef.current) return;
    unregisterMathRef.current?.();
    mathRef.current = element;
    if (!element) return;
    element.smartFence = true;
    element.mathVirtualKeyboardPolicy = 'manual';
    window.mathVirtualKeyboard.layouts = ['numeric', 'symbols', 'alphabetic', 'greek'];
    unregisterMathRef.current = registerMathfield('__line-composer__', element, (latex) => setValue(latex));
  }, []);

  function focusWriter() {
    if (tool === 'draw') return;
    if (mode === 'math') mathRef.current?.focus();
    else textRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    const handleFocus = () => requestAnimationFrame(focusWriter);
    window.addEventListener('mathnotebook:focus-writer', handleFocus);
    return () => window.removeEventListener('mathnotebook:focus-writer', handleFocus);
  });

  useEffect(() => {
    const handleMathCommand = (event: Event) => {
      const command = (event as CustomEvent<'keyboard' | 'menu'>).detail;
      const field = mathRef.current;
      if (!field) return;
      field.focus();
      if (command === 'keyboard') {
        if (window.mathVirtualKeyboard.visible) window.mathVirtualKeyboard.hide();
        else window.mathVirtualKeyboard.show();
      } else {
        const bounds = field.getBoundingClientRect();
        field.showMenu({
          location: { x: bounds.left + 18, y: bounds.bottom },
          modifiers: { alt: false, control: false, meta: false, shift: false },
        });
      }
    };
    window.addEventListener('mathnotebook:math-command', handleMathCommand);
    return () => window.removeEventListener('mathnotebook:math-command', handleMathCommand);
  }, []);

  useEffect(() => () => unregisterMathRef.current?.(), []);

  useEffect(() => {
    if (!value) requestAnimationFrame(focusWriter);
  }, [insertionPoint.y, mode, page.id]);

  function commitLine() {
    if (interpretation.items.length === 0 || lineIsOccupied) return;
    createMixedLine(interpretation.items);
    setValue('');
    if (mathRef.current) mathRef.current.value = '';
    setSelectedObject(null);
    setEditingObject(null);
    requestAnimationFrame(focusWriter);
  }

  return (
    <div
      className={`continuous-line-composer continuous-line-composer--${interpretation.intent}${lineIsOccupied ? ' is-occupied' : ''}`}
      style={{
        left: WRITING_LEFT,
        top: insertionPoint.y,
        width: page.width - WRITING_LEFT - 34,
      }}
      data-testid="continuous-line-composer"
      data-writing-mode={mode}
    >
      {mode === 'math' ? (
        <math-field
          class="line-math-composer"
          aria-label="Write mathematics on this ruled line"
          ref={attachMathfield}
          onInput={(event) => setValue((event.currentTarget as MathfieldElement).value)}
          onFocus={() => setActiveMathfield('__line-composer__')}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            event.stopPropagation();
            commitLine();
          }}
        />
      ) : (
        <textarea
          ref={textRef}
          aria-label="Write on this ruled line"
          rows={1}
          value={value}
          placeholder={lineIsOccupied ? 'Click the writing on this line to edit it' : 'Write here…'}
          disabled={lineIsOccupied}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              commitLine();
            }
          }}
        />
      )}
      {!lineIsOccupied && value && mode === 'auto' && (
        <span className="line-intent-indicator" aria-live="polite">
          {interpretation.intent === 'mixed' ? 'Text + math' : interpretation.intent}
        </span>
      )}
      {lineIsOccupied && (
        <button
          type="button"
          className="line-continue-button"
          onClick={() => {
            const nextY = Math.min(page.height - WRITING_LINE_HEIGHT, insertionPoint.y + WRITING_LINE_HEIGHT);
            useNotebookStore.getState().setInsertionPoint({ x: WRITING_LEFT, y: nextY });
            window.dispatchEvent(new Event('mathnotebook:focus-writer'));
          }}
        >
          Continue on next line
        </button>
      )}
      <span className="ruled-line-caret" aria-hidden="true" />
    </div>
  );
}
