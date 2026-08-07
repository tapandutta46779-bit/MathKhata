import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PageObject } from '../domain/model';
import { focusMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';
import { MathEditor } from './MathEditor';
import { TextEditor } from './TextEditor';

interface PageObjectViewProps {
  object: PageObject;
}

export function PageObjectView({ object }: PageObjectViewProps) {
  const selected = useNotebookStore((state) => state.selectedObjectId === object.id);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const moveObject = useNotebookStore((state) => state.moveObject);
  const duplicateSelectedObject = useNotebookStore((state) => state.duplicateSelectedObject);
  const deleteSelectedObject = useNotebookStore((state) => state.deleteSelectedObject);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedObject(object.id);
    const start = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const move = (pointerEvent: PointerEvent) => {
      setDragDelta({ x: pointerEvent.clientX - start.x, y: pointerEvent.clientY - start.y });
    };
    const finish = (pointerEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      const delta = { x: pointerEvent.clientX - start.x, y: pointerEvent.clientY - start.y };
      setDragDelta({ x: 0, y: 0 });
      if (Math.abs(delta.x) > 1 || Math.abs(delta.y) > 1) {
        moveObject(object.id, { x: object.x + delta.x, y: object.y + delta.y });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  }

  return (
    <section
      className={`page-object page-object--${object.type}${selected ? ' is-selected' : ''}`}
      data-testid={`page-object-${object.type}`}
      data-object-id={object.id}
      style={{
        left: object.x,
        top: object.y,
        width: object.width,
        minHeight: object.height,
        zIndex: object.zIndex,
        transform: `translate(${dragDelta.x}px, ${dragDelta.y}px)`,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        setSelectedObject(object.id);
      }}
      onDoubleClick={() => {
        if (object.type === 'math') focusMathfield(object.id);
      }}
    >
      {selected && (
        <div className="object-controls" aria-label="Selected object controls">
          <button
            type="button"
            className="drag-handle"
            aria-label="Drag object"
            title="Drag object"
            onPointerDown={startDrag}
          >
            ⠿
          </button>
          <span className="object-kind">{object.type === 'math' ? 'Math' : 'Text'}</span>
          <button
            type="button"
            aria-label="Duplicate selected object"
            title="Duplicate"
            onClick={(event) => {
              event.stopPropagation();
              duplicateSelectedObject();
            }}
          >
            ⧉
          </button>
          <button
            type="button"
            className="danger-quiet"
            aria-label="Delete selected object"
            title="Delete"
            onClick={(event) => {
              event.stopPropagation();
              deleteSelectedObject();
            }}
          >
            ×
          </button>
        </div>
      )}
      {object.type === 'math' ? <MathEditor object={object} /> : <TextEditor object={object} />}
    </section>
  );
}

