import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import type { Page, TextStyle } from '../domain/model';
import { TEXT_FONT_STACKS } from '../domain/textStyle';
import { interpretTypedLine, type LineIntentMode } from '../domain/lineIntent';
import { WRITING_LEFT, WRITING_LINE_HEIGHT } from '../domain/writingFlow';
import { registerMathfield, setActiveMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';
import { createMathObject, createTextObject } from '../domain/notebook';
import { useWritingDraft } from '../editor/writingDraft';

export type WritingMode = LineIntentMode;

interface ContinuousLineComposerProps {
  page: Page;
  mode: WritingMode;
  textStyle: TextStyle;
}

export function ContinuousLineComposer({ page, mode, textStyle }: ContinuousLineComposerProps) {
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const skipNextWriterFocus = useRef(false);
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
  function changeValue(next: string) {
    valueRef.current = next;
    setValue(next);
  }

  useEffect(() => {
    const notebookId = useNotebookStore.getState().notebook?.id;
    if (!notebookId || lineIsOccupied || !interpretation.items.length) {
      useWritingDraft.setState({ draft: null });
      return;
    }
    const objects = interpretation.items.map((item, index) => {
      const factory = { id: () => `writing-draft-${page.id}-${index}`, now: () => page.updatedAt };
      const point = { x: WRITING_LEFT + index, y: insertionPoint.y };
      return item.type === 'math'
        ? createMathObject(point, item.content, factory)
        : createTextObject(point, item.content, factory, textStyle);
    });
    useWritingDraft.setState({ draft: { notebookId, pageId: page.id, objects } });
    return () => { useWritingDraft.setState({ draft: null }); };
  }, [interpretation, insertionPoint.y, lineIsOccupied, page.id, page.updatedAt, textStyle]);

  const attachMathfield = useCallback((element: MathfieldElement | null) => {
    if (element === mathRef.current) return;
    unregisterMathRef.current?.();
    mathRef.current = element;
    if (!element) return;
    element.smartFence = true;
    element.mathVirtualKeyboardPolicy = 'manual';
    window.mathVirtualKeyboard.layouts = ['numeric', 'symbols', 'alphabetic', 'greek'];
    unregisterMathRef.current = registerMathfield('__line-composer__', element, (latex) => {
      valueRef.current = latex;
      setValue(latex);
    });
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
    if (skipNextWriterFocus.current) {
      skipNextWriterFocus.current = false;
      return;
    }
    if (!value) requestAnimationFrame(focusWriter);
  }, [insertionPoint.y, mode, page.id]);

  function commitLine(refocus = true) {
    const items = interpretTypedLine(valueRef.current, mode).items;
    if (items.length === 0 || lineIsOccupied) return;
    if (!createMixedLine(items).length) return;
    skipNextWriterFocus.current = !refocus;
    changeValue('');
    useWritingDraft.setState({ draft: null });
    if (mathRef.current) mathRef.current.value = '';
    setSelectedObject(null);
    setEditingObject(null);
    if (refocus) requestAnimationFrame(focusWriter);
  }

  useEffect(() => {
    const commit = () => commitLine(false);
    window.addEventListener('mathnotebook:commit-writing', commit);
    return () => window.removeEventListener('mathnotebook:commit-writing', commit);
  });

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
          onInput={(event) => changeValue((event.currentTarget as MathfieldElement).value)}
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
          style={{
            color: textStyle.color,
            fontFamily: TEXT_FONT_STACKS[textStyle.fontFamily],
            fontSize: textStyle.fontSize,
            fontWeight: textStyle.bold ? 700 : 400,
            fontStyle: textStyle.italic ? 'italic' : 'normal',
          }}
          onChange={(event) => changeValue(event.target.value)}
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
