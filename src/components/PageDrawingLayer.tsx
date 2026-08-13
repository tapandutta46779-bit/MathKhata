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

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy));
}

function drawingSegments(drawing: DrawingElement): Array<[Point, Point]> {
  const start = drawing.points[0];
  const end = drawing.points.at(-1) ?? start;
  if (!start || !end) return [];
  if (drawing.kind === 'rectangle') {
    const corners: Point[] = [
      { x: start.x, y: start.y }, { x: end.x, y: start.y },
      { x: end.x, y: end.y }, { x: start.x, y: end.y },
    ];
    return corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]);
  }
  if (drawing.kind === 'ellipse') {
    const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const points = Array.from({ length: 49 }, (_, index) => {
      const angle = index / 48 * Math.PI * 2;
      return { x: center.x + Math.cos(angle) * rx, y: center.y + Math.sin(angle) * ry };
    });
    return points.slice(1).map((point, index) => [points[index], point]);
  }
  if (drawing.kind === 'perpendicular') {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(24, Math.hypot(dx, dy));
    const half = Math.max(20, length * 0.36);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const normal = { x: -dy / length, y: dx / length };
    return [
      [start, end],
      [
        { x: middle.x - normal.x * half, y: middle.y - normal.y * half },
        { x: middle.x + normal.x * half, y: middle.y + normal.y * half },
      ],
    ];
  }
  const points = drawing.kind === 'polygon' && drawing.points.length > 2
    ? [...drawing.points, drawing.points[0]]
    : drawing.points;
  return points.slice(1).map((point, index) => [points[index], point]);
}

function drawingTouchesPoint(drawing: DrawingElement, point: Point, radius: number): boolean {
  return drawingSegments(drawing).some(([start, end]) =>
    pointToSegmentDistance(point, start, end) <= radius + drawing.width / 2);
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
  const removeDrawings = useNotebookStore((state) => state.removeDrawings);
  const undoLastDrawing = useNotebookStore((state) => state.undoLastDrawing);
  const [tool, setDrawingTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [eraserSize, setEraserSize] = useState(30);
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
  const [erasedIds, setErasedIds] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<DrawingElement | null>(null);
  const draftRef = useRef<DrawingElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const erasedIdsRef = useRef<Set<string>>(new Set());
  const lastEraserPointRef = useRef<Point | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
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

  function eraserRadiusInPage(): number {
    const bounds = svgRef.current?.getBoundingClientRect();
    return bounds?.width ? eraserSize / 2 * page.width / bounds.width : eraserSize / 2;
  }

  function eraseAt(point: Point) {
    const next = new Set(erasedIdsRef.current);
    for (const drawing of page.drawings) {
      if (!next.has(drawing.id) && drawingTouchesPoint(drawing, point, eraserRadiusInPage())) {
        next.add(drawing.id);
      }
    }
    if (next.size !== erasedIdsRef.current.size) {
      erasedIdsRef.current = next;
      setErasedIds(next);
    }
  }

  function start(event: ReactPointerEvent<SVGSVGElement>) {
    if (!active || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (tool === 'eraser') {
      const point = eventPoint(event);
      pointerIdRef.current = event.pointerId;
      lastEraserPointRef.current = point;
      erasedIdsRef.current = new Set();
      setErasedIds(new Set());
      setEraserCursor(point);
      eraseAt(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const next = createDraft(tool, color, width, eventPoint(event));
    draftRef.current = next;
    setDraft(next);
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const point = eventPoint(event);
    if (tool === 'eraser') setEraserCursor(point);
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    if (tool === 'eraser') {
      const previous = lastEraserPointRef.current ?? point;
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const step = Math.max(2, eraserRadiusInPage() * 0.55);
      const samples = Math.max(1, Math.ceil(distance / step));
      for (let index = 1; index <= samples; index += 1) {
        eraseAt({
          x: previous.x + (point.x - previous.x) * index / samples,
          y: previous.y + (point.y - previous.y) * index / samples,
        });
      }
      lastEraserPointRef.current = point;
      return;
    }
    if (!draftRef.current) return;
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
    if (tool === 'eraser') {
      const ids = [...erasedIdsRef.current];
      pointerIdRef.current = null;
      lastEraserPointRef.current = null;
      erasedIdsRef.current = new Set();
      setErasedIds(new Set());
      if (ids.length > 0) removeDrawings(ids);
      return;
    }
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
        ref={svgRef}
        className={`page-drawing-layer${active ? ' is-active' : ''}`}
        viewBox={`0 0 ${page.width} ${page.height}`}
        aria-label={active ? 'Page drawing canvas' : 'Saved page drawings'}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={() => {
          if (pointerIdRef.current === null) setEraserCursor(null);
        }}
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
          {page.drawings.filter((drawing) => !erasedIds.has(drawing.id)).map((drawing) => <DrawingMark key={drawing.id} drawing={drawing} />)}
          {draft && <DrawingMark drawing={draft} />}
        </g>
        {active && tool === 'eraser' && eraserCursor && (
          <circle
            className="page-eraser-cursor"
            cx={eraserCursor.x}
            cy={eraserCursor.y}
            r={eraserRadiusInPage()}
            aria-hidden="true"
          />
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
            {tool === 'eraser' ? (
              <>
                <div className="eraser-presets" aria-label="Eraser sizes">
                  <button type="button" className={eraserSize === 14 ? 'is-active' : ''} onClick={() => setEraserSize(14)}>Small</button>
                  <button type="button" className={eraserSize === 30 ? 'is-active' : ''} onClick={() => setEraserSize(30)}>Medium</button>
                  <button type="button" className={eraserSize === 60 ? 'is-active' : ''} onClick={() => setEraserSize(60)}>Large</button>
                </div>
                <label>
                  Eraser <input aria-label="Eraser size" type="range" min="8" max="80" step="2" value={eraserSize} onChange={(event) => setEraserSize(Number(event.target.value))} />
                  <output>{eraserSize}px</output>
                </label>
              </>
            ) : (
              <>
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
              </>
            )}
            <button type="button" className="drawing-undo" disabled={page.drawings.length === 0} onClick={undoLastDrawing}>Undo stroke</button>
          </div>
        </aside>
      )}
    </>
  );
}
