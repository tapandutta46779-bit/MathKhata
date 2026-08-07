import type { Page, Point } from '../domain/model';
import { snapToWritingLine } from '../domain/writingFlow';
import { blurActiveMathfield, focusMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';
import { PageObjectView } from './PageObjectView';
import { CalculationRail } from './CalculationRail';

interface NotebookPageProps {
  page: Page;
}

export function NotebookPage({ page }: NotebookPageProps) {
  const tool = useNotebookStore((state) => state.tool);
  const insertionPoint = useNotebookStore((state) => state.insertionPoint);
  const setInsertionPoint = useNotebookStore((state) => state.setInsertionPoint);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);
  const createObject = useNotebookStore((state) => state.createObject);

  function eventPoint(event: { currentTarget: HTMLElement; clientX: number; clientY: number }): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(12, Math.round(event.clientX - bounds.left)),
      y: Math.max(12, Math.round(event.clientY - bounds.top)),
    };
  }

  function activateAt(point: Point, selectedTool = tool) {
    const writingPoint = selectedTool === 'math' || selectedTool === 'text'
      ? { ...point, y: snapToWritingLine(point.y, page.height) }
      : point;
    setInsertionPoint(writingPoint);
    if (selectedTool === 'math' || selectedTool === 'text') {
      if (selectedTool === 'text') blurActiveMathfield();
      const id = createObject(selectedTool, writingPoint);
      if (id && selectedTool === 'math') requestAnimationFrame(() => focusMathfield(id));
      if (id && selectedTool === 'text') {
        const focusCreatedText = () => {
          const field = document.querySelector<HTMLTextAreaElement>(`[data-testid="text-field-${id}"]`);
          if (!field) return;
          const state = useNotebookStore.getState();
          state.setSelectedObject(id);
          state.setEditingObject(id);
          field.focus({ preventScroll: true });
          field.setSelectionRange(field.value.length, field.value.length);
        };
        // Creation happens on pointer-down. Focus after the browser completes
        // the matching pointer-up/click sequence so the prior MathLive editor
        // cannot reclaim keyboard input.
        window.setTimeout(focusCreatedText, 80);
      }
    } else {
      setSelectedObject(null);
    }
  }

  return (
    <article
      className={`notebook-page tool-${tool}`}
      aria-label={`Notebook page ${page.order + 1}`}
      data-testid="notebook-page"
      style={{ width: page.width, height: page.height }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        activateAt(eventPoint(event));
      }}
      onDoubleClick={(event) => {
        if (event.target !== event.currentTarget) return;
        activateAt(eventPoint(event), 'math');
      }}
    >
      <div
        className="insertion-marker"
        aria-hidden="true"
        style={{ left: insertionPoint.x, top: insertionPoint.y }}
      />
      {page.objects.map((object) => (
        <PageObjectView key={object.id} object={object} />
      ))}
      <CalculationRail page={page} />
    </article>
  );
}
