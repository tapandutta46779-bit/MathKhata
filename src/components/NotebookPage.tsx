import type { Page, Point, TextStyle } from '../domain/model';
import type { CSSProperties } from 'react';
import { snapToWritingLine } from '../domain/writingFlow';
import { blurActiveMathfield } from '../editor/mathfieldRegistry';
import { useNotebookStore } from '../store/notebookStore';
import { PageObjectView } from './PageObjectView';
import { CalculationRail } from './CalculationRail';
import { ContinuousLineComposer, type WritingMode } from './ContinuousLineComposer';
import { PageDrawingLayer } from './PageDrawingLayer';

interface NotebookPageProps {
  page: Page;
  writingMode: WritingMode;
  textStyle: TextStyle;
}

export function NotebookPage({ page, writingMode, textStyle }: NotebookPageProps) {
  const tool = useNotebookStore((state) => state.tool);
  const insertionPoint = useNotebookStore((state) => state.insertionPoint);
  const setInsertionPoint = useNotebookStore((state) => state.setInsertionPoint);
  const setSelectedObject = useNotebookStore((state) => state.setSelectedObject);

  function eventPoint(event: { currentTarget: HTMLElement; clientX: number; clientY: number }): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(12, Math.round(event.clientX - bounds.left)),
      y: Math.max(12, Math.round(event.clientY - bounds.top)),
    };
  }

  function activateAt(point: Point) {
    if (tool === 'draw' || tool === 'voice') return;
    const writingPoint = { x: 82, y: snapToWritingLine(point.y, page.height) };
    setInsertionPoint(writingPoint);
    blurActiveMathfield();
    setSelectedObject(null);
    window.dispatchEvent(new Event('mathnotebook:focus-writer'));
  }

  return (
    <article
      className={`notebook-page tool-${tool}`}
      aria-label={`Notebook page ${page.order + 1}`}
      data-testid="notebook-page"
      style={{ width: page.width, height: page.height, '--page-highlight': page.highlightColor ?? 'transparent' } as CSSProperties}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        activateAt(eventPoint(event));
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
      <ContinuousLineComposer key={page.id} page={page} mode={writingMode} textStyle={textStyle} />
      <CalculationRail page={page} />
      <PageDrawingLayer page={page} />
    </article>
  );
}
