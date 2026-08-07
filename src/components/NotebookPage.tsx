import type { Page, Point } from '../domain/model';
import { focusMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';
import { PageObjectView } from './PageObjectView';

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
    setInsertionPoint(point);
    if (selectedTool === 'math' || selectedTool === 'text') {
      const id = createObject(selectedTool, point);
      if (id && selectedTool === 'math') requestAnimationFrame(() => focusMathfield(id));
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
    </article>
  );
}
