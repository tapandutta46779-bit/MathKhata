import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DrawingElement, DrawingKind, Page, Point } from '../domain/model';
import { useNotebookStore } from '../store/notebookStore';

type DrawingTool = DrawingKind | 'eraser';

const COLORS = ['#2f2d29', '#a33d32', '#2d6597', '#2f7b55', '#7b4b9a', '#d58b22'];
const TOOL_OPTIONS: Array<{ id: DrawingTool; label: string; icon: string }> = [
  { id: 'pen', label: 'Pen', icon: '✎' },
  { id: 'highlighter', label: 'Highlighter', icon: '▰' },
  { id: 'line', label: 'Line', icon: '╱' },
  { id: 'arrow', label: 'Arrow', icon: '→' },
  { id: 'rectangle', label: 'Rectangle', icon: '□' },
  { id: 'ellipse', label: 'Circle or ellipse', icon: '○' },
  { id: 'polygon', label: 'Polygon', icon: '⬠' },
  { id: 'perpendicular', label: 'Perpendicular lines', icon: '⊥' },
  { id: 'eraser', label: 'Eraser', icon: '⌫' },
];

function pathData(points: Point[], close = false): string {
  if (points.length === 0) return '';
  const commands = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`);
  return `${commands.join(' ')}${close ? ' Z' : ''}`;
}

function DrawingMark({ drawing, hitTarget = false }: { drawing: DrawingElement; hitTarget?: boolean }) {
  const [start, end] = [drawing.points[0], drawing.points.at(-1) ?? drawing.points[0]];
  const common = {
    'data-drawing-id': drawing.id,
    stroke: hitTarget ? 'transparent' : drawing.color,
    strokeWidth: hitTarget ? Math.max(14, drawing.width + 10) : drawing.width,
    strokeOpacity: hitTarget ? 0 : drawing.opacity,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    pointerEvents: hitTarget ? ('stroke' as const) : ('none' as const),
  };
  if (drawing.kind === 'rectangle') {
    return <rect {...common} x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} />;
  }
  if (drawing.kind === 'ellipse') {
    return <ellipse {...common} cx={(start.x + end.x) / 2} cy={(start.y + end.y) / 2} rx={Math.abs(end.x - start.x) / 2} ry={Math.abs(end.y - start.y) / 2} />;
  }
  if (drawing.kind === 'line' || drawing.kind === 'arrow') {
    return <line {...common} x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={!hitTarget && drawing.kind === 'arrow' ? 'url(#page-arrowhead)' : undefined} />;
  }
  if (drawing.kind === 'perpendicular') {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(24, Math.hypot(dx, dy));
    const half = Math.max(20, length * 0.36);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const normal = { x: -dy / length, y: dx / length };
    return (
      <g data-drawing-id={drawing.id} pointerEvents={hitTarget ? 'stroke' : 'none'}>
        <line {...common} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
        <line {...common} x1={middle.x - normal.x * half} y1={middle.y - normal.y * half} x2={middle.x + normal.x * half} y2={middle.y + normal.y * half} />
      </g>
    );
  }
  return <path {...common} d={pathData(drawing.points, drawing.kind === 'polygon')} />;
}

function createDraft(kind: DrawingKind, color: string, width: number, point: Point): DrawingElement {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind,
    color,
    width: kind === 'highlighter' ? Math.max(10, width * 2.2) : width,
    opacity: kind === 'highlighter' ? 0.28 : 1,
    points: [point, point],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function PageDrawingLayer({ page }: { page: Page }) {
  const active = useNotebookStore((state) => state.tool === 'draw');
  const setTool = useNotebookStore((state) => state.setTool);
  const addDrawing = useNotebookStore((state) => state.addDrawing);
  const removeDrawing = useNotebookStore((state) => state.removeDrawing);
  const undoLastDrawing = useNotebookStore((state) => state.undoLastDrawing);
  const [tool, setDrawingTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [draft, setDraft] = useState<DrawingElement | null>(null);
  const draftRef = useRef<DrawingElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const markerId = useMemo(() => `page-arrowhead-${page.id.replace(/[^a-zA-Z0-9_-]/g, '')}`, [page.id]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  function eventPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(page.width, (event.clientX - bounds.left) * page.width / bounds.width)),
      y: Math.max(0, Math.min(page.height, (event.clientY - bounds.top) * page.height / bounds.height)),
    };
  }

  function start(event: ReactPointerEvent<SVGSVGElement>) {
    if (!active || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (tool === 'eraser') {
      const target = event.target as SVGElement;
      const id = target.closest<SVGElement>('[data-drawing-id]')?.dataset.drawingId;
      if (id) removeDrawing(id);
      return;
    }
    const next = createDraft(tool, color, width, eventPoint(event));
    draftRef.current = next;
    setDraft(next);
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointerIdRef.current !== event.pointerId || !draftRef.current) return;
    event.preventDefault();
    const point = eventPoint(event);
    const current = draftRef.current;
    const freehand = current.kind === 'pen' || current.kind === 'highlighter' || current.kind === 'polygon';
    const points = freehand ? [...current.points, point] : [current.points[0], point];
    const next = { ...current, points, updatedAt: new Date().toISOString() };
    draftRef.current = next;
    setDraft(next);
  }

  function finish(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const completed = draftRef.current;
    pointerIdRef.current = null;
    draftRef.current = null;
    setDraft(null);
    if (!completed) return;
    const startPoint = completed.points[0];
    const endPoint = completed.points.at(-1) ?? startPoint;
    if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) >= 3) addDrawing(completed);
  }

  return (
    <>
      <svg
        className={`page-drawing-layer${active ? ' is-active' : ''}`}
        viewBox={`0 0 ${page.width} ${page.height}`}
        aria-label={active ? 'Page drawing canvas' : 'Saved page drawings'}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <defs>
          <marker id="page-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
          </marker>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
          </marker>
        </defs>
        <g className="page-drawing-layer__marks">
          {page.drawings.map((drawing) => <DrawingMark key={drawing.id} drawing={drawing} />)}
          {draft && <DrawingMark drawing={draft} />}
        </g>
        {active && tool === 'eraser' && (
          <g className="page-drawing-layer__hit-targets">
            {page.drawings.map((drawing) => <DrawingMark key={drawing.id} drawing={drawing} hitTarget />)}
          </g>
        )}
      </svg>
      {active && (
        <aside className="drawing-toolbar" aria-label="Drawing tools">
          <header>
            <strong>Draw on paper</strong>
            <button type="button" aria-label="Close drawing tools" onClick={() => setTool('select')}>×</button>
          </header>
          <div className="drawing-toolbar__tools">
            {TOOL_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={tool === option.id ? 'is-active' : ''}
                aria-pressed={tool === option.id}
                aria-label={option.label}
                title={option.label}
                onClick={() => setDrawingTool(option.id)}
              >
                <span aria-hidden="true">{option.icon}</span>
              </button>
            ))}
          </div>
          <div className="drawing-toolbar__settings">
            <div className="drawing-colors" aria-label="Pen color">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={color === option ? 'is-active' : ''}
                  aria-label={`Use color ${option}`}
                  style={{ '--drawing-color': option } as React.CSSProperties}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>
            <label>
              Nib <input aria-label="Pen nib width" type="range" min="1" max="18" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
              <output>{width}px</output>
            </label>
            <button type="button" className="drawing-undo" disabled={page.drawings.length === 0} onClick={undoLastDrawing}>Undo stroke</button>
          </div>
        </aside>
      )}
    </>
  );
}
