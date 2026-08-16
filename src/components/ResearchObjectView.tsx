import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { MathfieldElement } from 'mathlive';
import type { ResearchObject, ResearchValue } from '../domain/model';
import { useNotebookStore } from '../store/notebookStore';

function expressionText(value: ResearchValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (!entry || Array.isArray(entry) || typeof entry !== 'object') return [];
    for (const key of ['latex', 'expression', 'x', 'command']) {
      const candidate = entry[key];
      if (typeof candidate === 'string' && candidate.trim()) return [candidate];
    }
    return [];
  });
}

function PreviewMath({ value }: { value: string }) {
  return <math-field
    class="research-object-math"
    read-only="true"
    ref={(field: MathfieldElement | null) => {
      if (!field) return;
      field.value = value;
      field.readOnly = true;
    }}
  />;
}

export function ResearchObjectView({ object }: { object: ResearchObject }) {
  const moveObject = useNotebookStore((state) => state.moveObject);
  const resizeObject = useNotebookStore((state) => state.resizeObject);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const duplicateSelectedObject = useNotebookStore((state) => state.duplicateSelectedObject);
  const deleteSelectedObject = useNotebookStore((state) => state.deleteSelectedObject);
  const drag = useRef<{ pointerId: number; x: number; y: number; objectX: number; objectY: number } | null>(null);
  const resize = useRef<{ pointerId: number; x: number; y: number; width: number; height: number } | null>(null);
  const expressions = useMemo(() => Object.entries(object.snapshot.values)
    .filter(([key]) => /expressions|surfaces|objects|points/i.test(key))
    .flatMap(([, value]) => expressionText(value))
    .slice(0, 4), [object.snapshot.values]);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, objectX: object.x, objectY: object.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    moveObject(object.id, {
      x: drag.current.objectX + event.clientX - drag.current.x,
      y: drag.current.objectY + event.clientY - drag.current.y,
    });
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    resize.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: object.width, height: object.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (resize.current?.pointerId !== event.pointerId) return;
    resizeObject(object.id,
      resize.current.width + event.clientX - resize.current.x,
      resize.current.height + event.clientY - resize.current.y);
  }

  return <div
    className="research-object-card"
    onDoubleClick={(event) => {
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent('mathnotebook:edit-research-object', { detail: object.id }));
    }}
  >
    <button
      type="button"
      className="research-object-drag"
      aria-label={`Move ${object.snapshot.title} snapshot`}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <span>{object.snapshot.title}</span><small>Double-click to edit copy</small>
    </button>
    <div className="research-object-actions">
      <button type="button" aria-label={`Duplicate ${object.snapshot.title} snapshot`} onClick={(event) => { event.stopPropagation(); setSelectedObject(object.id); requestAnimationFrame(() => duplicateSelectedObject()); }}>⧉</button>
      <button type="button" aria-label={`Delete ${object.snapshot.title} snapshot`} onClick={(event) => { event.stopPropagation(); setSelectedObject(object.id); requestAnimationFrame(() => deleteSelectedObject()); }}>×</button>
    </div>
    <div className="research-object-preview">
      {object.snapshot.previewDataUrl
        ? <img src={object.snapshot.previewDataUrl} alt={`${object.snapshot.title} preview`} />
        : <div className="research-object-preview__empty">Interactive research snapshot</div>}
      {expressions.length > 0 && <div className="research-object-expressions">{expressions.map((expression, index) => <PreviewMath key={`${index}-${expression}`} value={expression} />)}</div>}
    </div>
    <button
      type="button"
      className="research-object-resize"
      aria-label={`Resize ${object.snapshot.title} snapshot`}
      onPointerDown={startResize}
      onPointerMove={moveResize}
      onPointerUp={() => { resize.current = null; }}
      onPointerCancel={() => { resize.current = null; }}
    >↘</button>
  </div>;
}
