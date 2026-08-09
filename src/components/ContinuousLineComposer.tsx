import { useEffect, useMemo, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import type { Page } from '../domain/model';
import {
  interpretTypedLine,
  type LineIntentMode,
} from '../domain/lineIntent';
import { nextWritingPoint } from '../domain/writingFlow';
import { useNotebookStore } from '../store/notebookStore';

export function ContinuousLineComposer({ page }: { page: Page }) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<LineIntentMode>('auto');
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const tool = useNotebookStore((state) => state.tool);
  const editingObjectId = useNotebookStore((state) => state.editingObjectId);
  const createMixedLine = useNotebookStore((state) => state.createMixedLine);
  const setEditingObject = useNotebookStore((state) => state.setEditingObject);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const point = nextWritingPoint(page);
  const interpretation = useMemo(() => interpretTypedLine(value, mode), [mode, value]);
  const mathPreview = interpretation.items.find((item) => item.type === 'math')?.content;

  useEffect(() => {
    const focusWhenFree = window.setTimeout(() => {
      if (
        !editingObjectId
        && tool === 'select'
        && (document.activeElement === document.body || document.activeElement === null)
      ) fieldRef.current?.focus({ preventScroll: true });
    }, 160);
    return () => window.clearTimeout(focusWhenFree);
  }, [editingObjectId, page.id, tool]);

  function commitLine() {
    if (interpretation.items.length === 0) return;
    createMixedLine(interpretation.items);
    setValue('');
    setSelectedObject(null);
    setEditingObject(null);
    requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }));
  }

  return (
    <div
      className={`continuous-line-composer continuous-line-composer--${interpretation.intent}`}
      style={{ left: point.x, top: point.y }}
      data-testid="continuous-line-composer"
    >
      <textarea
        ref={fieldRef}
        aria-label="Continuous notebook line"
        rows={1}
        value={value}
        placeholder="Write the next line…"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            commitLine();
          }
        }}
      />
      <div className="continuous-line-composer__tools">
        <div className="line-mode-switch" aria-label="Line interpretation mode">
          {(['auto', 'math', 'text'] as const).map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={mode === option}
              onClick={() => {
                setMode(option);
                fieldRef.current?.focus({ preventScroll: true });
              }}
            >
              {option === 'auto' ? `Auto · ${interpretation.intent}` : option}
            </button>
          ))}
        </div>
        <span>Enter continues</span>
      </div>
      {mathPreview && (
        <math-field
          class="continuous-line-preview"
          read-only="true"
          aria-label="Detected mathematics preview"
          ref={(element) => {
            if (element && (element as MathfieldElement).value !== mathPreview) {
              (element as MathfieldElement).value = mathPreview;
            }
          }}
        />
      )}
    </div>
  );
}
