import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  angleDegrees,
  circleCircleIntersections,
  dilateCoordinate,
  geometryDistance,
  geometryMidpoint,
  geometryPointLabel,
  lineIntersection,
  lineCircleIntersections,
  polygonArea,
  polygonPerimeter,
  reflectCoordinate,
  rotateCoordinate,
  translateCoordinate,
} from '../research/geometry';

export type ResearchTool = '2d' | '3d' | 'geometry' | 'scientific';

const TABS: Array<{ id: ResearchTool; label: string }> = [
  { id: '2d', label: '2D Graph' },
  { id: '3d', label: '3D Surface' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'scientific', label: 'Scientific' },
];

async function numericEvaluator(expression: string) {
  const { default: nerdamer } = await import('nerdamer-prime');
  nerdamer.set('SILENCE_WARNINGS', true);
  const parsed = nerdamer(expression);
  return (substitutions: Record<string, number>) => {
    const value = Number(parsed.evaluate(substitutions).text('decimals'));
    return Number.isFinite(value) ? value : Number.NaN;
  };
}

async function numericEvaluatorWithRestrictions(expression: string) {
  const restrictions: string[] = [];
  const baseExpression = expression.replace(/\{([^{}]+)\}/g, (_match, restriction: string) => {
    restrictions.push(restriction.trim());
    return '';
  }).trim();
  const evaluate = await numericEvaluator(baseExpression);
  const compileComparison = async (source: string) => {
    const chained = source.match(/^(.+?)(<=|>=|<|>)(.+?)(<=|>=|<|>)(.+)$/);
    const pairs = chained
      ? [[chained[1], chained[2], chained[3]], [chained[3], chained[4], chained[5]]]
      : (() => {
        const match = source.match(/^(.+?)(<=|>=|=|<|>)(.+)$/);
        return match ? [[match[1], match[2], match[3]]] : [];
      })();
    if (!pairs.length) {
      const condition = await numericEvaluator(source);
      return (values: Record<string, number>) => Boolean(condition(values));
    }
    const evaluators = await Promise.all(pairs.map(async ([left, operator, right]) => ({
      left: await numericEvaluator(left.trim()), operator, right: await numericEvaluator(right.trim()),
    })));
    return (values: Record<string, number>) => evaluators.every((entry) => {
      const left = entry.left(values); const right = entry.right(values);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (entry.operator === '<') return left < right;
      if (entry.operator === '<=') return left <= right;
      if (entry.operator === '>') return left > right;
      if (entry.operator === '>=') return left >= right;
      return Math.abs(left - right) < 1e-9;
    });
  };
  const conditions = await Promise.all(restrictions.map(compileComparison));
  return (values: Record<string, number>) => conditions.every((condition) => condition(values)) ? evaluate(values) : Number.NaN;
}

function gridStep(scale: number): number {
  const raw = 64 / scale;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const factor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return factor * power;
}

const GRAPH_COLORS = ['#9a482c', '#3777a5', '#6b8e4e', '#8e5aa4', '#d18425', '#258f87'];

function usePersistentResearchState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key);
      return saved === null ? initialValue : JSON.parse(saved) as T;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* The workspace remains usable without persistence. */ }
  }, [key, state]);
  return [state, setState];
}

interface GraphExpression {
  id: number;
  expression: string;
  color: string;
  visible: boolean;
}

function Graph2D({ storagePrefix }: { storagePrefix: string }) {
  const [expressions, setExpressions] = usePersistentResearchState<GraphExpression[]>(`${storagePrefix}:2d:expressions`, [
    { id: 1, expression: 'sin(x)', color: GRAPH_COLORS[0], visible: true },
    { id: 2, expression: 'x^2/8-2', color: GRAPH_COLORS[1], visible: true },
  ]);
  const [viewport, setViewport] = usePersistentResearchState(`${storagePrefix}:2d:viewport`, { centerX: 0, centerY: 0, scale: 52 });
  const [error, setError] = useState('');
  const [trace, setTrace] = useState<{ x: number; y: number; color: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; centerX: number; centerY: number } | null>(null);
  const evaluatorsRef = useRef<Array<{ color: string; evaluate: (values: Record<string, number>) => number }>>([]);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const width = canvas.width;
      const height = canvas.height;
      context.fillStyle = '#fffefa';
      context.fillRect(0, 0, width, height);
      try {
        const step = gridStep(viewport.scale);
        const worldLeft = viewport.centerX - width / (2 * viewport.scale);
        const worldRight = viewport.centerX + width / (2 * viewport.scale);
        const worldBottom = viewport.centerY - height / (2 * viewport.scale);
        const worldTop = viewport.centerY + height / (2 * viewport.scale);
        const screenX = (x: number) => width / 2 + (x - viewport.centerX) * viewport.scale;
        const screenY = (y: number) => height / 2 - (y - viewport.centerY) * viewport.scale;

        context.font = '10px ui-monospace, monospace';
        context.textAlign = 'center';
        context.textBaseline = 'top';
        for (let x = Math.ceil(worldLeft / step) * step; x <= worldRight; x += step) {
          const px = screenX(x);
          context.strokeStyle = Math.abs(x) < step / 100 ? '#8b877d' : '#e4e0d7';
          context.lineWidth = Math.abs(x) < step / 100 ? 1.5 : 1;
          context.beginPath(); context.moveTo(px, 0); context.lineTo(px, height); context.stroke();
          if (Math.abs(x) > step / 100) {
            context.fillStyle = '#8c887f';
            context.fillText(Number(x.toPrecision(5)).toString(), px, Math.min(height - 14, Math.max(3, screenY(0) + 4)));
          }
        }
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        for (let y = Math.ceil(worldBottom / step) * step; y <= worldTop; y += step) {
          const py = screenY(y);
          context.strokeStyle = Math.abs(y) < step / 100 ? '#8b877d' : '#e4e0d7';
          context.lineWidth = Math.abs(y) < step / 100 ? 1.5 : 1;
          context.beginPath(); context.moveTo(0, py); context.lineTo(width, py); context.stroke();
          if (Math.abs(y) > step / 100) {
            context.fillStyle = '#8c887f';
            context.fillText(Number(y.toPrecision(5)).toString(), Math.min(width - 35, Math.max(4, screenX(0) + 5)), py);
          }
        }

        const active = expressions.filter((entry) => entry.visible && entry.expression.trim());
        const evaluators = await Promise.all(active.map(async (entry) => ({
          color: entry.color,
          evaluate: await numericEvaluatorWithRestrictions(entry.expression),
        })));
        if (cancelled) return;
        evaluatorsRef.current = evaluators;
        for (const entry of evaluators) {
          context.strokeStyle = entry.color;
          context.lineWidth = 2.25;
          context.lineJoin = 'round';
          context.beginPath();
          let drawing = false;
          let previousY = 0;
          for (let pixel = 0; pixel <= width; pixel += 2) {
            const x = worldLeft + pixel / viewport.scale;
            const y = entry.evaluate({ x });
            const py = screenY(y);
            const discontinuity = drawing && Math.abs(py - previousY) > height * .8;
            if (!Number.isFinite(py) || py < -height * 4 || py > height * 5 || discontinuity) {
              drawing = false;
            } else if (!drawing) {
              context.moveTo(pixel, py);
              drawing = true;
            } else context.lineTo(pixel, py);
            previousY = py;
          }
          context.stroke();
        }
        setError('');
      } catch {
        evaluatorsRef.current = [];
        setError('Check each visible expression. Examples: sin(x), x^2, exp(-x^2).');
      }
    };
    void draw();
    return () => { cancelled = true; };
  }, [expressions, viewport]);

  const updateExpression = (id: number, patch: Partial<GraphExpression>) => {
    setExpressions((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  };

  return (
    <section className="research-graph-lab">
      <aside className="graph-expression-list" aria-label="2D graph expressions">
        <header><strong>Expressions</strong><span>{expressions.length}/6</span></header>
        {expressions.map((entry, index) => (
          <div className="graph-expression" key={entry.id}>
            <button
              type="button"
              className={`graph-color${entry.visible ? ' is-visible' : ''}`}
              style={{ '--graph-color': entry.color } as React.CSSProperties}
              aria-label={`${entry.visible ? 'Hide' : 'Show'} expression ${index + 1}`}
              onClick={() => updateExpression(entry.id, { visible: !entry.visible })}
            />
            <label><span>y =</span><input aria-label={`Expression ${index + 1}`} value={entry.expression} onChange={(event) => updateExpression(entry.id, { expression: event.target.value })} /></label>
            {expressions.length > 1 && <button type="button" aria-label={`Remove expression ${index + 1}`} onClick={() => setExpressions((current) => current.filter((item) => item.id !== entry.id))}>×</button>}
          </div>
        ))}
        <button
          type="button"
          className="graph-add-expression"
          disabled={expressions.length >= 6}
          onClick={() => setExpressions((current) => [...current, {
            id: Math.max(0, ...current.map((entry) => entry.id)) + 1,
            expression: '',
            color: GRAPH_COLORS[current.length % GRAPH_COLORS.length],
            visible: true,
          }])}
        >
          + Add expression
        </button>
        <p>Drag to pan · wheel to zoom · point to trace</p>
      </aside>
      <div className="graph-stage">
        <div className="graph-controls" aria-label="2D graph view controls">
          <button type="button" aria-label="Zoom in" onClick={() => setViewport((view) => ({ ...view, scale: Math.min(300, view.scale * 1.25) }))}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => setViewport((view) => ({ ...view, scale: Math.max(12, view.scale / 1.25) }))}>−</button>
          <button type="button" aria-label="Reset graph view" onClick={() => setViewport({ centerX: 0, centerY: 0, scale: 52 })}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          aria-label="Interactive 2D graph"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, centerX: viewport.centerX, centerY: viewport.centerY };
          }}
          onPointerMove={(event) => {
            const canvas = event.currentTarget;
            const bounds = canvas.getBoundingClientRect();
            const ratioX = canvas.width / bounds.width;
            const ratioY = canvas.height / bounds.height;
            if (dragRef.current) {
              const drag = dragRef.current;
              setViewport((view) => ({
                ...view,
                centerX: drag.centerX - (event.clientX - drag.pointerX) * ratioX / view.scale,
                centerY: drag.centerY + (event.clientY - drag.pointerY) * ratioY / view.scale,
              }));
              setTrace(null);
              return;
            }
            const x = viewport.centerX + ((event.clientX - bounds.left) * ratioX - canvas.width / 2) / viewport.scale;
            const candidates = evaluatorsRef.current.map((entry) => ({ x, y: entry.evaluate({ x }), color: entry.color })).filter((point) => Number.isFinite(point.y));
            const mouseY = viewport.centerY - ((event.clientY - bounds.top) * ratioY - canvas.height / 2) / viewport.scale;
            candidates.sort((left, right) => Math.abs(left.y - mouseY) - Math.abs(right.y - mouseY));
            setTrace(candidates[0] ?? null);
          }}
          onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { dragRef.current = null; }}
          onPointerLeave={() => { if (!dragRef.current) setTrace(null); }}
          onWheel={(event) => {
            event.preventDefault();
            const canvas = event.currentTarget;
            const bounds = canvas.getBoundingClientRect();
            const px = (event.clientX - bounds.left) * canvas.width / bounds.width;
            const py = (event.clientY - bounds.top) * canvas.height / bounds.height;
            setViewport((view) => {
              const worldX = view.centerX + (px - canvas.width / 2) / view.scale;
              const worldY = view.centerY - (py - canvas.height / 2) / view.scale;
              const scale = Math.max(12, Math.min(300, view.scale * Math.exp(-event.deltaY * .0015)));
              return {
                centerX: worldX - (px - canvas.width / 2) / scale,
                centerY: worldY + (py - canvas.height / 2) / scale,
                scale,
              };
            });
          }}
        />
        {trace && <output className="graph-trace" style={{ '--graph-color': trace.color } as React.CSSProperties}>x = {trace.x.toFixed(4)} · y = {trace.y.toFixed(4)}</output>}
        {error && <p className="research-tool-error graph-error">{error}</p>}
      </div>
    </section>
  );
}

interface SurfaceExpression {
  id: number;
  expression: string;
  color: string;
  visible: boolean;
  opacity: number;
}

interface Graph3DParameter {
  id: number;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

interface Graph3DPointExpression {
  id: number;
  x: string;
  y: string;
  z: string;
  color: string;
  visible: boolean;
}

interface Graph3DCurveExpression extends Graph3DPointExpression {
  tMin: number;
  tMax: number;
}

interface Graph3DParametricSurface extends Graph3DPointExpression {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  opacity: number;
}

type SurfaceRenderMode = 'solid' | 'mesh' | 'contours';
type SurfaceProjection = 'perspective' | 'orthographic';

function Graph3D({ storagePrefix }: { storagePrefix: string }) {
  const [surfaces, setSurfaces] = usePersistentResearchState<SurfaceExpression[]>(`${storagePrefix}:3d:surfaces`, [
    { id: 1, expression: 'a*sin(x)*cos(y)', color: GRAPH_COLORS[0], visible: true, opacity: .66 },
  ]);
  const [parameters, setParameters] = usePersistentResearchState<Graph3DParameter[]>(`${storagePrefix}:3d:parameters`, [
    { id: 1, name: 'a', value: 1, min: -3, max: 3, step: .1 },
  ]);
  const [points3D, setPoints3D] = usePersistentResearchState<Graph3DPointExpression[]>(`${storagePrefix}:3d:points`, []);
  const [curves3D, setCurves3D] = usePersistentResearchState<Graph3DCurveExpression[]>(`${storagePrefix}:3d:curves`, []);
  const [parametricSurfaces, setParametricSurfaces] = usePersistentResearchState<Graph3DParametricSurface[]>(`${storagePrefix}:3d:parametric-surfaces`, []);
  const [implicitSurfaces, setImplicitSurfaces] = usePersistentResearchState<SurfaceExpression[]>(`${storagePrefix}:3d:implicit-surfaces`, []);
  const [domain, setDomain] = usePersistentResearchState(`${storagePrefix}:3d:domain`, 5);
  const [resolution, setResolution] = usePersistentResearchState(`${storagePrefix}:3d:resolution`, 29);
  const [camera, setCamera] = usePersistentResearchState(`${storagePrefix}:3d:camera`, { yaw: -.72, pitch: -.58, zoom: 1 });
  const [renderMode, setRenderMode] = usePersistentResearchState<SurfaceRenderMode>(`${storagePrefix}:3d:render`, 'solid');
  const [projection, setProjection] = usePersistentResearchState<SurfaceProjection>(`${storagePrefix}:3d:projection`, 'perspective');
  const [showAxes, setShowAxes] = usePersistentResearchState(`${storagePrefix}:3d:axes`, true);
  const [showGrid, setShowGrid] = usePersistentResearchState(`${storagePrefix}:3d:grid`, true);
  const [showSurfaceIntersections, setShowSurfaceIntersections] = usePersistentResearchState(`${storagePrefix}:3d:intersections`, true);
  const [perspectiveStrength, setPerspectiveStrength] = usePersistentResearchState(`${storagePrefix}:3d:perspective-strength`, .65);
  const [lockRotation, setLockRotation] = usePersistentResearchState(`${storagePrefix}:3d:lock-rotation`, false);
  const [lockZoom, setLockZoom] = usePersistentResearchState(`${storagePrefix}:3d:lock-zoom`, false);
  const [error, setError] = useState('');
  const [trace, setTrace] = useState<{ x: number; y: number; z: number; color: string; expression: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const tracePointsRef = useRef<Array<{ screenX: number; screenY: number; x: number; y: number; z: number; color: string; expression: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#fffefa';
      context.fillRect(0, 0, canvas.width, canvas.height);
      try {
        const cosYaw = Math.cos(camera.yaw);
        const sinYaw = Math.sin(camera.yaw);
        const cosPitch = Math.cos(camera.pitch);
        const sinPitch = Math.sin(camera.pitch);
        const scale = camera.zoom * Math.min(canvas.width, canvas.height) / (domain * 3.05);
        const project = (x: number, y: number, z: number) => {
          const yawX = x * cosYaw - y * sinYaw;
          const yawY = x * sinYaw + y * cosYaw;
          const pitchY = yawY * cosPitch - z * sinPitch;
          const depth = yawY * sinPitch + z * cosPitch;
          const cameraDistance = domain * (8.5 - perspectiveStrength * 5);
          const perspectiveScale = projection === 'perspective'
            ? cameraDistance / Math.max(domain * 1.4, cameraDistance + depth)
            : 1;
          return {
            x: canvas.width / 2 + yawX * scale * perspectiveScale,
            y: canvas.height / 2 + pitchY * scale * perspectiveScale,
            depth,
          };
        };
        const drawSpatialLine = (start: [number, number, number], end: [number, number, number], color: string, width = 1) => {
          const from = project(...start);
          const to = project(...end);
          context.strokeStyle = color;
          context.lineWidth = width;
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        };
        if (showGrid) {
          context.save();
          context.setLineDash([3, 4]);
          const gridEvery = domain <= 4 ? 1 : domain <= 8 ? 2 : 3;
          for (let value = -domain; value <= domain + .001; value += gridEvery) {
            drawSpatialLine([-domain, value, 0], [domain, value, 0], 'rgba(95,91,82,.18)');
            drawSpatialLine([value, -domain, 0], [value, domain, 0], 'rgba(95,91,82,.18)');
          }
          context.restore();
        }

        const reservedParameters = new Set(['x', 'y', 'z', 't', 'u', 'v']);
        const invalidParameters = parameters.filter((parameter) => (
          !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(parameter.name.trim()) || reservedParameters.has(parameter.name.trim())
        ));
        const parameterValues = Object.fromEntries(parameters
          .filter((parameter) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(parameter.name.trim()) && !reservedParameters.has(parameter.name.trim()))
          .map((parameter) => [parameter.name.trim(), parameter.value]));
        const cells: Array<{
          points: Array<{ x: number; y: number; z: number }>;
          depth: number;
          height: number;
          color: string;
          opacity: number;
        }> = [];
        const implicitPoints: Array<{ x: number; y: number; depth: number; worldX: number; worldY: number; worldZ: number; color: string; opacity: number; expression: string }> = [];
        const tracePoints: typeof tracePointsRef.current = [];
        const issues: string[] = invalidParameters.length ? ['Slider names cannot be x, y, z, t, u, or v.'] : [];
        const surfaceSamples: Array<{
          surface: SurfaceExpression;
          grid: Array<Array<{ x: number; y: number; z: number; depth: number; worldX: number; worldY: number; rawZ: number }>>;
        }> = [];
        const active = surfaces.filter((surface) => surface.visible && surface.expression.trim());
        for (const [surfaceIndex, surface] of active.entries()) {
          try {
            const evaluate = await numericEvaluatorWithRestrictions(surface.expression);
            const surfaceGrid: Array<Array<{ x: number; y: number; z: number; depth: number; worldX: number; worldY: number; rawZ: number }>> = [];
            for (let row = 0; row < resolution; row += 1) {
              const points = [];
              const y = -domain + row * domain * 2 / (resolution - 1);
              for (let column = 0; column < resolution; column += 1) {
                const x = -domain + column * domain * 2 / (resolution - 1);
                const rawZ = evaluate({ x, y, ...parameterValues });
                const z = Math.max(-domain * 2.5, Math.min(domain * 2.5, rawZ));
                const projected = project(x, y, z);
                if (cancelled) return;
                points.push({ ...projected, z, rawZ, worldX: x, worldY: y });
                if (Number.isFinite(rawZ) && (row + column) % 2 === 0) {
                  tracePoints.push({ screenX: projected.x, screenY: projected.y, x, y, z: rawZ, color: surface.color, expression: surface.expression });
                }
              }
              surfaceGrid.push(points);
            }
            surfaceSamples.push({ surface, grid: surfaceGrid });
            for (let row = 0; row < resolution - 1; row += 1) {
              for (let column = 0; column < resolution - 1; column += 1) {
                const points = [surfaceGrid[row][column], surfaceGrid[row][column + 1], surfaceGrid[row + 1][column + 1], surfaceGrid[row + 1][column]];
                if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))) continue;
                cells.push({
                  points,
                  depth: points.reduce((sum, point) => sum + point.depth, 0) / 4,
                  height: points.reduce((sum, point) => sum + point.z, 0) / 4,
                  color: surface.color,
                  opacity: surface.opacity,
                });
              }
            }
          } catch {
            issues.push(`Surface ${surfaceIndex + 1}: check ${surface.expression}.`);
          }
        }
        for (const [surfaceIndex, surface] of parametricSurfaces.filter((entry) => entry.visible).entries()) {
          try {
            const evaluateX = await numericEvaluator(surface.x);
            const evaluateY = await numericEvaluator(surface.y);
            const evaluateZ = await numericEvaluator(surface.z);
            const sampleCount = Math.max(13, Math.min(35, resolution));
            const surfaceGrid: Array<Array<{ x: number; y: number; z: number; depth: number }>> = [];
            for (let row = 0; row < sampleCount; row += 1) {
              const v = surface.vMin + (surface.vMax - surface.vMin) * row / (sampleCount - 1);
              const rowPoints = [];
              for (let column = 0; column < sampleCount; column += 1) {
                const u = surface.uMin + (surface.uMax - surface.uMin) * column / (sampleCount - 1);
                const substitutions = { u, v, ...parameterValues };
                const x = evaluateX(substitutions);
                const y = evaluateY(substitutions);
                const z = evaluateZ(substitutions);
                const projected = project(x, y, z);
                rowPoints.push({ ...projected, z });
                if ([x, y, z, projected.x, projected.y].every(Number.isFinite) && (row + column) % 3 === 0) {
                  tracePoints.push({ screenX: projected.x, screenY: projected.y, x, y, z, color: surface.color, expression: `parametric surface ${surfaceIndex + 1}` });
                }
              }
              surfaceGrid.push(rowPoints);
            }
            for (let row = 0; row < sampleCount - 1; row += 1) {
              for (let column = 0; column < sampleCount - 1; column += 1) {
                const points = [surfaceGrid[row][column], surfaceGrid[row][column + 1], surfaceGrid[row + 1][column + 1], surfaceGrid[row + 1][column]];
                if (points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))) continue;
                cells.push({
                  points,
                  depth: points.reduce((sum, point) => sum + point.depth, 0) / 4,
                  height: points.reduce((sum, point) => sum + point.z, 0) / 4,
                  color: surface.color,
                  opacity: surface.opacity,
                });
              }
            }
          } catch {
            issues.push(`Parametric surface ${surfaceIndex + 1}: check x(u,v), y(u,v), z(u,v), and bounds.`);
          }
        }
        for (const [surfaceIndex, surface] of implicitSurfaces.filter((entry) => entry.visible && entry.expression.trim()).entries()) {
          try {
            const evaluate = await numericEvaluatorWithRestrictions(surface.expression);
            const sampleCount = Math.max(11, Math.min(17, Math.round(resolution / 2)));
            const step = domain * 2 / (sampleCount - 1);
            const values: number[][][] = [];
            for (let zIndex = 0; zIndex < sampleCount; zIndex += 1) {
              const z = -domain + zIndex * step;
              const plane: number[][] = [];
              for (let yIndex = 0; yIndex < sampleCount; yIndex += 1) {
                const y = -domain + yIndex * step;
                const row = [];
                for (let xIndex = 0; xIndex < sampleCount; xIndex += 1) {
                  const x = -domain + xIndex * step;
                  row.push(evaluate({ x, y, z, ...parameterValues }));
                }
                plane.push(row);
              }
              values.push(plane);
            }
            const addCrossing = (first: { x: number; y: number; z: number; value: number }, last: { x: number; y: number; z: number; value: number }) => {
              if (!Number.isFinite(first.value) || !Number.isFinite(last.value) || first.value * last.value > 0 || Math.abs(first.value - last.value) < 1e-12) return;
              const ratio = first.value / (first.value - last.value);
              const worldX = first.x + (last.x - first.x) * ratio;
              const worldY = first.y + (last.y - first.y) * ratio;
              const worldZ = first.z + (last.z - first.z) * ratio;
              const projected = project(worldX, worldY, worldZ);
              implicitPoints.push({ ...projected, worldX, worldY, worldZ, color: surface.color, opacity: surface.opacity, expression: surface.expression });
            };
            for (let zIndex = 0; zIndex < sampleCount; zIndex += 1) {
              const z = -domain + zIndex * step;
              for (let yIndex = 0; yIndex < sampleCount; yIndex += 1) {
                const y = -domain + yIndex * step;
                for (let xIndex = 0; xIndex < sampleCount; xIndex += 1) {
                  const x = -domain + xIndex * step;
                  const first = { x, y, z, value: values[zIndex][yIndex][xIndex] };
                  if (xIndex + 1 < sampleCount) addCrossing(first, { x: x + step, y, z, value: values[zIndex][yIndex][xIndex + 1] });
                  if (yIndex + 1 < sampleCount) addCrossing(first, { x, y: y + step, z, value: values[zIndex][yIndex + 1][xIndex] });
                  if (zIndex + 1 < sampleCount) addCrossing(first, { x, y, z: z + step, value: values[zIndex + 1][yIndex][xIndex] });
                }
              }
            }
          } catch {
            issues.push(`Implicit surface ${surfaceIndex + 1}: enter F(x,y,z), interpreted as F = 0.`);
          }
        }
        cells.sort((left, right) => left.depth - right.depth);
        for (const cell of cells) {
          context.save();
          const heightFade = .62 + .38 * Math.max(0, Math.min(1, (cell.height / domain + 1) / 2));
          context.globalAlpha = cell.opacity * heightFade;
          if (renderMode === 'contours') {
            const minimum = Math.min(...cell.points.map((point) => point.z));
            const maximum = Math.max(...cell.points.map((point) => point.z));
            const contourStep = Math.max(.25, domain / 5);
            context.strokeStyle = cell.color;
            context.lineWidth = 1.15;
            for (let level = Math.ceil(minimum / contourStep) * contourStep; level <= maximum + 1e-8; level += contourStep) {
              const intersections: Array<{ x: number; y: number }> = [];
              for (let edge = 0; edge < cell.points.length; edge += 1) {
                const first = cell.points[edge];
                const last = cell.points[(edge + 1) % cell.points.length];
                const firstDelta = first.z - level;
                const lastDelta = last.z - level;
                if (firstDelta * lastDelta > 0 || Math.abs(first.z - last.z) < 1e-10) continue;
                const ratio = (level - first.z) / (last.z - first.z);
                if (ratio < 0 || ratio > 1) continue;
                intersections.push({ x: first.x + (last.x - first.x) * ratio, y: first.y + (last.y - first.y) * ratio });
              }
              for (let index = 0; index + 1 < intersections.length; index += 2) {
                context.beginPath(); context.moveTo(intersections[index].x, intersections[index].y); context.lineTo(intersections[index + 1].x, intersections[index + 1].y); context.stroke();
              }
            }
            context.restore();
            continue;
          }
          context.fillStyle = renderMode === 'solid' ? cell.color : 'transparent';
          context.strokeStyle = cell.color;
          context.lineWidth = .65;
          context.beginPath();
          cell.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
          context.closePath();
          if (renderMode === 'solid') context.fill();
          if (renderMode !== 'solid' || cell.opacity > .2) context.stroke();
          context.restore();
        }
        implicitPoints.sort((left, right) => left.depth - right.depth);
        implicitPoints.forEach((point, index) => {
          context.save(); context.globalAlpha = Math.max(.2, point.opacity); context.fillStyle = point.color;
          context.beginPath(); context.arc(point.x, point.y, renderMode === 'mesh' ? 1.25 : 2.1, 0, Math.PI * 2); context.fill(); context.restore();
          if (index % 7 === 0) tracePoints.push({ screenX: point.x, screenY: point.y, x: point.worldX, y: point.worldY, z: point.worldZ, color: point.color, expression: `${point.expression} = 0` });
        });
        if (showSurfaceIntersections && surfaceSamples.length > 1) {
          const threshold = domain * 1.7 / Math.max(1, resolution - 1);
          context.save();
          context.fillStyle = '#3f315c';
          context.globalAlpha = .9;
          for (let leftIndex = 0; leftIndex < surfaceSamples.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < surfaceSamples.length; rightIndex += 1) {
              const left = surfaceSamples[leftIndex];
              const right = surfaceSamples[rightIndex];
              for (let row = 0; row < resolution; row += 1) {
                for (let column = 0; column < resolution; column += 1) {
                  const first = left.grid[row][column];
                  const last = right.grid[row][column];
                  if (!Number.isFinite(first.rawZ) || !Number.isFinite(last.rawZ) || Math.abs(first.rawZ - last.rawZ) > threshold) continue;
                  const z = (first.rawZ + last.rawZ) / 2;
                  const point = project(first.worldX, first.worldY, z);
                  context.beginPath(); context.arc(point.x, point.y, 1.8, 0, Math.PI * 2); context.fill();
                  if ((row + column) % 3 === 0) tracePoints.push({ screenX: point.x, screenY: point.y, x: first.worldX, y: first.worldY, z, color: '#3f315c', expression: 'surface intersection' });
                }
              }
            }
          }
          context.restore();
        }
        for (const [curveIndex, curve] of curves3D.filter((entry) => entry.visible).entries()) {
          try {
            const evaluateX = await numericEvaluator(curve.x);
            const evaluateY = await numericEvaluator(curve.y);
            const evaluateZ = await numericEvaluator(curve.z);
            context.save(); context.strokeStyle = curve.color; context.lineWidth = 3; context.beginPath();
            let drawing = false;
            for (let sample = 0; sample <= 180; sample += 1) {
              const t = curve.tMin + (curve.tMax - curve.tMin) * sample / 180;
              const substitutions = { t, ...parameterValues };
              const x = evaluateX(substitutions); const y = evaluateY(substitutions); const z = evaluateZ(substitutions);
              const point = project(x, y, z);
              if (![x, y, z, point.x, point.y].every(Number.isFinite)) { drawing = false; continue; }
              if (!drawing) { context.moveTo(point.x, point.y); drawing = true; } else context.lineTo(point.x, point.y);
              if (sample % 6 === 0) tracePoints.push({ screenX: point.x, screenY: point.y, x, y, z, color: curve.color, expression: `curve ${curveIndex + 1}` });
            }
            context.stroke(); context.restore();
          } catch { issues.push(`Curve ${curveIndex + 1}: check its x(t), y(t), and z(t).`); }
        }
        for (const [pointIndex, entry] of points3D.filter((point) => point.visible).entries()) {
          try {
            const x = (await numericEvaluator(entry.x))(parameterValues);
            const y = (await numericEvaluator(entry.y))(parameterValues);
            const z = (await numericEvaluator(entry.z))(parameterValues);
            const point = project(x, y, z);
            if (![x, y, z, point.x, point.y].every(Number.isFinite)) throw new Error('Non-finite point');
            context.save(); context.fillStyle = entry.color; context.strokeStyle = '#fffefa'; context.lineWidth = 2;
            context.beginPath(); context.arc(point.x, point.y, 6, 0, Math.PI * 2); context.fill(); context.stroke();
            context.fillStyle = '#312d27'; context.font = 'bold 11px ui-monospace, monospace'; context.fillText(`P${pointIndex + 1}`, point.x + 8, point.y - 7); context.restore();
            tracePoints.push({ screenX: point.x, screenY: point.y, x, y, z, color: entry.color, expression: `point ${pointIndex + 1}` });
          } catch { issues.push(`Point ${pointIndex + 1}: check its coordinates.`); }
        }
        if (showAxes) {
          const axes = [
            { start: [-domain * 1.1, 0, 0] as [number, number, number], end: [domain * 1.2, 0, 0] as [number, number, number], label: 'x', color: '#a45236' },
            { start: [0, -domain * 1.1, 0] as [number, number, number], end: [0, domain * 1.2, 0] as [number, number, number], label: 'y', color: '#3777a5' },
            { start: [0, 0, -domain * 1.1] as [number, number, number], end: [0, 0, domain * 1.2] as [number, number, number], label: 'z', color: '#5f8b4c' },
          ];
          context.font = 'bold 12px ui-monospace, monospace';
          axes.forEach((axis) => {
            drawSpatialLine(axis.start, axis.end, axis.color, 1.8);
            const endpoint = project(...axis.end);
            context.fillStyle = axis.color;
            context.fillText(axis.label, endpoint.x + 4, endpoint.y - 4);
          });
        }
        tracePointsRef.current = tracePoints;
        setError(issues.join(' '));
      } catch {
        tracePointsRef.current = [];
        setError('Enter surfaces in x and y, for example x^2-y^2 or sin(x)*cos(y).');
      }
    };
    void draw();
    return () => { cancelled = true; };
  }, [camera, curves3D, domain, implicitSurfaces, parameters, parametricSurfaces, perspectiveStrength, points3D, projection, renderMode, resolution, showAxes, showGrid, showSurfaceIntersections, surfaces]);

  const updateSurface = (id: number, patch: Partial<SurfaceExpression>) => {
    setSurfaces((current) => current.map((surface) => surface.id === id ? { ...surface, ...patch } : surface));
  };

  const setCameraPreset = (preset: 'iso' | 'top' | 'front' | 'side') => {
    const cameras = {
      iso: { yaw: -.72, pitch: -.58, zoom: 1 },
      top: { yaw: 0, pitch: 0, zoom: 1 },
      front: { yaw: 0, pitch: -1.52, zoom: 1 },
      side: { yaw: Math.PI / 2, pitch: -1.52, zoom: 1 },
    };
    setCamera(cameras[preset]);
  };

  return (
    <section className="research-graph-lab research-graph-lab--3d">
      <aside className="graph-expression-list graph-expression-list--3d" aria-label="3D graph expressions">
        <header><strong>3D expressions</strong><span>{surfaces.length + implicitSurfaces.length + parametricSurfaces.length}</span></header>
        {surfaces.map((surface, index) => (
          <div className="surface-expression-card" key={surface.id}>
            <div className="surface-expression-main">
              <button
                type="button"
                className={`graph-color${surface.visible ? ' is-visible' : ''}`}
                style={{ '--graph-color': surface.color } as React.CSSProperties}
                aria-label={`${surface.visible ? 'Hide' : 'Show'} surface ${index + 1}`}
                onClick={() => updateSurface(surface.id, { visible: !surface.visible })}
              />
              <label><span>z =</span><input aria-label={`3D surface expression ${index + 1}`} value={surface.expression} onChange={(event) => updateSurface(surface.id, { expression: event.target.value })} /></label>
              {surfaces.length > 1 && <button type="button" aria-label={`Remove surface ${index + 1}`} onClick={() => setSurfaces((current) => current.filter((entry) => entry.id !== surface.id))}>×</button>}
            </div>
            <div className="surface-style-row">
              <label>Color <input type="color" aria-label={`Surface ${index + 1} color`} value={surface.color} onChange={(event) => updateSurface(surface.id, { color: event.target.value })} /></label>
              <label>Opacity <input type="range" aria-label={`Surface ${index + 1} opacity`} min="0.18" max="1" step="0.05" value={surface.opacity} onChange={(event) => updateSurface(surface.id, { opacity: Number(event.target.value) })} /></label>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="graph-add-expression"
          disabled={surfaces.length >= 4}
          onClick={() => setSurfaces((current) => [...current, {
            id: Math.max(0, ...current.map((surface) => surface.id)) + 1,
            expression: '',
            color: GRAPH_COLORS[current.length % GRAPH_COLORS.length],
            visible: true,
            opacity: .58,
          }])}
        >+ Add surface</button>
        {implicitSurfaces.map((surface, index) => <div className="surface-expression-card implicit-surface-card" key={`implicit-${surface.id}`}>
          <div className="surface-expression-main">
            <button type="button" className={`graph-color${surface.visible ? ' is-visible' : ''}`} style={{ '--graph-color': surface.color } as React.CSSProperties} aria-label={`${surface.visible ? 'Hide' : 'Show'} implicit surface ${index + 1}`} onClick={() => setImplicitSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, visible: !entry.visible } : entry))} />
            <label><span>0 =</span><input aria-label={`Implicit surface expression ${index + 1}`} value={surface.expression} onChange={(event) => setImplicitSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, expression: event.target.value } : entry))} /></label>
            <button type="button" aria-label={`Remove implicit surface ${index + 1}`} onClick={() => setImplicitSurfaces((current) => current.filter((entry) => entry.id !== surface.id))}>×</button>
          </div>
          <div className="surface-style-row"><label>Color <input type="color" aria-label={`Implicit surface ${index + 1} color`} value={surface.color} onChange={(event) => setImplicitSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, color: event.target.value } : entry))} /></label><label>Opacity <input type="range" aria-label={`Implicit surface ${index + 1} opacity`} min="0.18" max="1" step="0.05" value={surface.opacity} onChange={(event) => setImplicitSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, opacity: Number(event.target.value) } : entry))} /></label></div>
        </div>)}
        <button type="button" className="graph-add-expression" disabled={implicitSurfaces.length >= 2} onClick={() => setImplicitSurfaces((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, expression: 'x^2+y^2+z^2-9', color: GRAPH_COLORS[(surfaces.length + current.length) % GRAPH_COLORS.length], visible: true, opacity: .72 }])}>+ Add implicit F(x,y,z)=0</button>
        <section className="graph-parameter-section" aria-label="3D graph parameters">
          <header><strong>Parameters</strong><span>Use names in any expression</span></header>
          {parameters.map((parameter, index) => <div className="graph-parameter" key={parameter.id}>
            <div><input className="parameter-name" aria-label={`Parameter ${index + 1} name`} value={parameter.name} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, name: event.target.value.replace(/[^a-zA-Z0-9_]/g, '') } : entry))} /><output>{parameter.value.toFixed(2)}</output><button type="button" aria-label={`Remove parameter ${parameter.name}`} onClick={() => setParameters((current) => current.filter((entry) => entry.id !== parameter.id))}>×</button></div>
            <input type="range" aria-label={`Parameter ${parameter.name} value`} min={parameter.min} max={parameter.max} step={parameter.step} value={parameter.value} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, value: Number(event.target.value) } : entry))} />
            <div className="parameter-range"><label>min <input type="number" value={parameter.min} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, min: Number(event.target.value) } : entry))} /></label><label>max <input type="number" value={parameter.max} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, max: Number(event.target.value) } : entry))} /></label></div>
          </div>)}
          <button type="button" className="graph-add-expression" disabled={parameters.length >= 4} onClick={() => setParameters((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, name: ['a', 'b', 'c', 'd'].find((name) => !current.some((entry) => entry.name === name)) ?? `p${current.length + 1}`, value: 1, min: -5, max: 5, step: .1 }])}>+ Add slider</button>
        </section>
        <section className="graph-3d-object-section" aria-label="3D points curves and parametric surfaces">
          <header><strong>Points · curves · parametric surfaces</strong><span>{points3D.length + curves3D.length + parametricSurfaces.length}</span></header>
          {points3D.map((point, index) => <div className="graph-3d-object-card" key={`point-${point.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${point.visible ? ' is-visible' : ''}`} style={{ '--graph-color': point.color } as React.CSSProperties} aria-label={`${point.visible ? 'Hide' : 'Show'} 3D point ${index + 1}`} onClick={() => setPoints3D((current) => current.map((entry) => entry.id === point.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>P{index + 1}</strong><button type="button" aria-label={`Remove 3D point ${index + 1}`} onClick={() => setPoints3D((current) => current.filter((entry) => entry.id !== point.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis} = <input aria-label={`3D point ${index + 1} ${axis} coordinate`} value={point[axis]} onChange={(event) => setPoints3D((current) => current.map((entry) => entry.id === point.id ? { ...entry, [axis]: event.target.value } : entry))} /></label>)}</div>
          </div>)}
          {curves3D.map((curve, index) => <div className="graph-3d-object-card" key={`curve-${curve.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${curve.visible ? ' is-visible' : ''}`} style={{ '--graph-color': curve.color } as React.CSSProperties} aria-label={`${curve.visible ? 'Hide' : 'Show'} 3D curve ${index + 1}`} onClick={() => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>C{index + 1}(t)</strong><button type="button" aria-label={`Remove 3D curve ${index + 1}`} onClick={() => setCurves3D((current) => current.filter((entry) => entry.id !== curve.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis}(t) = <input aria-label={`3D curve ${index + 1} ${axis} expression`} value={curve[axis]} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, [axis]: event.target.value } : entry))} /></label>)}</div>
            <div className="curve-domain"><label>t min <input type="number" step="0.1" value={curve.tMin} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, tMin: Number(event.target.value) } : entry))} /></label><label>t max <input type="number" step="0.1" value={curve.tMax} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, tMax: Number(event.target.value) } : entry))} /></label></div>
          </div>)}
          {parametricSurfaces.map((surface, index) => <div className="graph-3d-object-card" key={`parametric-surface-${surface.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${surface.visible ? ' is-visible' : ''}`} style={{ '--graph-color': surface.color } as React.CSSProperties} aria-label={`${surface.visible ? 'Hide' : 'Show'} parametric surface ${index + 1}`} onClick={() => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>S{index + 1}(u,v)</strong><button type="button" aria-label={`Remove parametric surface ${index + 1}`} onClick={() => setParametricSurfaces((current) => current.filter((entry) => entry.id !== surface.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis}(u,v) = <input aria-label={`Parametric surface ${index + 1} ${axis} expression`} value={surface[axis]} onChange={(event) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, [axis]: event.target.value } : entry))} /></label>)}</div>
            <div className="parametric-surface-domain">
              <label>u min <input type="number" step="0.1" value={surface.uMin} onChange={(event) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, uMin: Number(event.target.value) } : entry))} /></label>
              <label>u max <input type="number" step="0.1" value={surface.uMax} onChange={(event) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, uMax: Number(event.target.value) } : entry))} /></label>
              <label>v min <input type="number" step="0.1" value={surface.vMin} onChange={(event) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, vMin: Number(event.target.value) } : entry))} /></label>
              <label>v max <input type="number" step="0.1" value={surface.vMax} onChange={(event) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, vMax: Number(event.target.value) } : entry))} /></label>
            </div>
            <div className="surface-style-row"><label>Color <input type="color" aria-label={`Parametric surface ${index + 1} color`} value={surface.color} onChange={(event) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, color: event.target.value } : entry))} /></label><label>Opacity <input type="range" aria-label={`Parametric surface ${index + 1} opacity`} min="0.18" max="1" step="0.05" value={surface.opacity} onChange={(event) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, opacity: Number(event.target.value) } : entry))} /></label></div>
          </div>)}
          <div className="graph-object-adders"><button type="button" onClick={() => setPoints3D((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, x: '1', y: '1', z: '1', color: GRAPH_COLORS[(surfaces.length + current.length) % GRAPH_COLORS.length], visible: true }])}>+ Point</button><button type="button" onClick={() => setCurves3D((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, x: 'cos(t)', y: 'sin(t)', z: 't/3', tMin: -6.28, tMax: 6.28, color: GRAPH_COLORS[(surfaces.length + points3D.length + current.length) % GRAPH_COLORS.length], visible: true }])}>+ Parametric curve</button><button type="button" onClick={() => setParametricSurfaces((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, x: '(2+cos(v))*cos(u)', y: '(2+cos(v))*sin(u)', z: 'sin(v)', uMin: 0, uMax: 6.28, vMin: 0, vMax: 6.28, color: GRAPH_COLORS[(surfaces.length + points3D.length + curves3D.length + current.length) % GRAPH_COLORS.length], visible: true, opacity: .62 }])}>+ Parametric surface</button></div>
        </section>
        <div className="surface-view-options">
          <label>Rendering<select aria-label="3D rendering style" value={renderMode} onChange={(event) => setRenderMode(event.target.value as SurfaceRenderMode)}><option value="solid">Solid + mesh</option><option value="mesh">Wire mesh</option><option value="contours">Contour mesh</option></select></label>
          <label>Projection<select aria-label="3D projection" value={projection} onChange={(event) => setProjection(event.target.value as SurfaceProjection)}><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
          <label><input type="checkbox" checked={showAxes} onChange={(event) => setShowAxes(event.target.checked)} /> Axes</label>
          <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Ground grid</label>
          <label><input type="checkbox" checked={showSurfaceIntersections} onChange={(event) => setShowSurfaceIntersections(event.target.checked)} /> Surface intersections</label>
          <label><input type="checkbox" checked={lockRotation} onChange={(event) => setLockRotation(event.target.checked)} /> Lock rotation</label>
          <label><input type="checkbox" checked={lockZoom} onChange={(event) => setLockZoom(event.target.checked)} /> Lock zoom</label>
        </div>
        <label className="graph-slider">Perspective {Math.round(perspectiveStrength * 100)}%<input type="range" min="0" max="1" step="0.05" disabled={projection === 'orthographic'} value={perspectiveStrength} onChange={(event) => setPerspectiveStrength(Number(event.target.value))} /></label>
        <label className="graph-slider">Domain ±{domain}<input type="range" min="2" max="12" step="1" value={domain} onChange={(event) => setDomain(Number(event.target.value))} /></label>
        <label className="graph-slider">Mesh {resolution}×{resolution}<input type="range" min="17" max="45" step="2" value={resolution} onChange={(event) => setResolution(Number(event.target.value))} /></label>
        <div className="surface-presets" aria-label="3D camera presets">
          <button type="button" onClick={() => setCameraPreset('iso')}>Perspective</button>
          <button type="button" onClick={() => setCameraPreset('top')}>Top</button>
          <button type="button" onClick={() => setCameraPreset('front')}>Front</button>
          <button type="button" onClick={() => setCameraPreset('side')}>Side</button>
        </div>
        <p>Drag to orbit · wheel to zoom · hover to inspect · restrict explicit/implicit expressions with {'{x>-2}{x<2}'}</p>
      </aside>
      <div className="graph-stage">
        <div className="graph-controls" aria-label="3D graph view controls">
          <button type="button" aria-label="Zoom 3D view in" disabled={lockZoom} onClick={() => setCamera((view) => ({ ...view, zoom: Math.min(2.6, view.zoom * 1.2) }))}>+</button>
          <button type="button" aria-label="Zoom 3D view out" disabled={lockZoom} onClick={() => setCamera((view) => ({ ...view, zoom: Math.max(.45, view.zoom / 1.2) }))}>−</button>
          <button type="button" aria-label="Reset 3D view" onClick={() => setCameraPreset('iso')}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          aria-label="Interactive 3D graph"
          onPointerDown={(event) => {
            if (lockRotation) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch };
          }}
          onPointerMove={(event) => {
            if (dragRef.current) {
              const drag = dragRef.current;
              setCamera((view) => ({
                ...view,
                yaw: drag.yaw + (event.clientX - drag.x) * .009,
                pitch: Math.max(-1.52, Math.min(1.52, drag.pitch + (event.clientY - drag.y) * .009)),
              }));
              setTrace(null);
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            const pointerX = (event.clientX - bounds.left) * event.currentTarget.width / bounds.width;
            const pointerY = (event.clientY - bounds.top) * event.currentTarget.height / bounds.height;
            const closest = tracePointsRef.current.reduce<typeof tracePointsRef.current[number] | null>((best, point) => {
              const distance = Math.hypot(point.screenX - pointerX, point.screenY - pointerY);
              if (distance > 22) return best;
              if (!best) return point;
              return distance < Math.hypot(best.screenX - pointerX, best.screenY - pointerY) ? point : best;
            }, null);
            setTrace(closest ? { x: closest.x, y: closest.y, z: closest.z, color: closest.color, expression: closest.expression } : null);
          }}
          onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { dragRef.current = null; }}
          onPointerLeave={() => { if (!dragRef.current) setTrace(null); }}
          onDoubleClick={() => setCameraPreset('iso')}
          onWheel={(event) => {
            event.preventDefault();
            if (lockZoom) return;
            setCamera((view) => ({ ...view, zoom: Math.max(.45, Math.min(2.6, view.zoom * Math.exp(-event.deltaY * .0015))) }));
          }}
        />
        {trace && <output className="graph-trace graph-trace--3d" style={{ '--graph-color': trace.color } as React.CSSProperties}>x = {trace.x.toFixed(3)} · y = {trace.y.toFixed(3)} · z = {trace.z.toFixed(3)}</output>}
        {error && <p className="research-tool-error graph-error">{error}</p>}
      </div>
    </section>
  );
}

type GeometryConstraint =
  | { type: 'midpoint'; sources: [number, number] }
  | { type: 'parallel-guide'; sources: [number, number]; through: number; length: number }
  | { type: 'perpendicular-guide'; sources: [number, number]; through: number; length: number }
  | { type: 'compass-edge'; sources: [number, number]; center: number }
  | { type: 'translate'; source: number; dx: number; dy: number }
  | { type: 'rotate'; source: number; angle: number }
  | { type: 'dilate'; source: number; scale: number }
  | { type: 'reflect'; source: number; axis: 'x' | 'y' };
interface GeometryPoint { id: number; x: number; y: number; label: string; constraint?: GeometryConstraint }
type GeometryTool = 'move' | 'point' | 'segment' | 'vector' | 'line' | 'ray' | 'circle' | 'polygon' | 'angle' | 'midpoint' | 'parallel' | 'perpendicular' | 'compass' | 'delete';
interface GeometryObjectStyle { visible?: boolean; color?: string; label?: string }
type LinearGeometryObject = GeometryObjectStyle & { id: number; type: 'segment' | 'vector' | 'line' | 'ray'; points: [number, number] };
type GeometryObject =
  | LinearGeometryObject
  | (GeometryObjectStyle & { id: number; type: 'circle'; points: [number, number] })
  | (GeometryObjectStyle & { id: number; type: 'polygon'; points: number[] })
  | (GeometryObjectStyle & { id: number; type: 'angle'; points: [number, number, number] });

const GEOMETRY_TOOLS: Array<{ id: GeometryTool; label: string; symbol: string }> = [
  { id: 'move', label: 'Move points and pan', symbol: '↖' },
  { id: 'point', label: 'Add point', symbol: '•' },
  { id: 'segment', label: 'Construct segment', symbol: '╱' },
  { id: 'vector', label: 'Construct vector', symbol: '↗' },
  { id: 'line', label: 'Construct line', symbol: '↔' },
  { id: 'ray', label: 'Construct ray', symbol: '→' },
  { id: 'circle', label: 'Construct circle', symbol: '○' },
  { id: 'polygon', label: 'Construct polygon', symbol: '△' },
  { id: 'angle', label: 'Measure angle', symbol: '∠' },
  { id: 'midpoint', label: 'Construct midpoint', symbol: '⊙' },
  { id: 'parallel', label: 'Construct parallel line', symbol: '∥' },
  { id: 'perpendicular', label: 'Construct perpendicular line', symbol: '⊥' },
  { id: 'compass', label: 'Copy radius with compass', symbol: '◉' },
  { id: 'delete', label: 'Delete object or point', symbol: '⌫' },
];

function GeometryLab({ storagePrefix }: { storagePrefix: string }) {
  const [points, setPoints] = usePersistentResearchState<GeometryPoint[]>(`${storagePrefix}:geometry:points`, []);
  const [objects, setObjects] = usePersistentResearchState<GeometryObject[]>(`${storagePrefix}:geometry:objects`, []);
  const [tool, setTool] = usePersistentResearchState<GeometryTool>(`${storagePrefix}:geometry:tool`, 'point');
  const [pendingPointIds, setPendingPointIds] = useState<number[]>([]);
  const [viewport, setViewport] = usePersistentResearchState(`${storagePrefix}:geometry:viewport`, { centerX: 0, centerY: 0, scale: 42 });
  const [snap, setSnap] = usePersistentResearchState(`${storagePrefix}:geometry:snap`, true);
  const [showMeasurements, setShowMeasurements] = usePersistentResearchState(`${storagePrefix}:geometry:measurements`, true);
  const [showIntersections, setShowIntersections] = usePersistentResearchState(`${storagePrefix}:geometry:intersections`, true);
  const [showGrid, setShowGrid] = usePersistentResearchState(`${storagePrefix}:geometry:grid`, true);
  const [showAxes, setShowAxes] = usePersistentResearchState(`${storagePrefix}:geometry:axes`, true);
  const [lockViewport, setLockViewport] = usePersistentResearchState(`${storagePrefix}:geometry:lock-viewport`, false);
  const [angleUnit, setAngleUnit] = usePersistentResearchState<'degrees' | 'radians'>(`${storagePrefix}:geometry:angle-unit`, 'degrees');
  const [selectedObjectIds, setSelectedObjectIds] = useState<number[]>([]);
  const [constructionCommand, setConstructionCommand] = useState('');
  const [commandError, setCommandError] = useState('');
  const [transform, setTransform] = useState({ dx: 2, dy: 1, angle: 90, scale: 2 });
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextPointIdRef = useRef(Math.max(0, ...points.map((point) => point.id)) + 1);
  const nextObjectIdRef = useRef(Math.max(0, ...objects.map((object) => object.id)) + 1);
  const dragRef = useRef<
    | { kind: 'point'; pointId: number }
    | { kind: 'pan'; x: number; y: number; centerX: number; centerY: number }
    | null
  >(null);

  useEffect(() => {
    setPoints((current) => {
      let next = current.map((point) => ({ ...point }));
      let changed = false;
      for (let pass = 0; pass < Math.max(1, current.length); pass += 1) {
        let passChanged = false;
        const byId = new Map(next.map((point) => [point.id, point]));
        next = next.map((point) => {
          const constraint = point.constraint;
          if (!constraint) return point;
          let coordinate: { x: number; y: number } | null = null;
          if (constraint.type === 'midpoint') {
            const first = byId.get(constraint.sources[0]); const last = byId.get(constraint.sources[1]);
            if (first && last) coordinate = geometryMidpoint(first, last);
          } else if (constraint.type === 'parallel-guide' || constraint.type === 'perpendicular-guide') {
            const first = byId.get(constraint.sources[0]); const last = byId.get(constraint.sources[1]); const through = byId.get(constraint.through);
            if (first && last && through) {
              const dx = last.x - first.x; const dy = last.y - first.y; const length = Math.hypot(dx, dy) || 1;
              const direction = constraint.type === 'parallel-guide' ? { x: dx / length, y: dy / length } : { x: -dy / length, y: dx / length };
              coordinate = { x: through.x + direction.x * constraint.length, y: through.y + direction.y * constraint.length };
            }
          } else if (constraint.type === 'compass-edge') {
            const first = byId.get(constraint.sources[0]); const last = byId.get(constraint.sources[1]); const center = byId.get(constraint.center);
            if (first && last && center) coordinate = { x: center.x + geometryDistance(first, last), y: center.y };
          } else {
            const source = byId.get(constraint.source);
            if (source) {
              if (constraint.type === 'translate') coordinate = translateCoordinate(source, constraint.dx, constraint.dy);
              else if (constraint.type === 'rotate') coordinate = rotateCoordinate(source, { x: 0, y: 0 }, constraint.angle);
              else if (constraint.type === 'dilate') coordinate = dilateCoordinate(source, { x: 0, y: 0 }, constraint.scale);
              else coordinate = reflectCoordinate(source, constraint.axis);
            }
          }
          if (!coordinate || (Math.abs(coordinate.x - point.x) < 1e-9 && Math.abs(coordinate.y - point.y) < 1e-9)) return point;
          passChanged = true; changed = true;
          return { ...point, ...coordinate };
        });
        if (!passChanged) break;
      }
      return changed ? next : current;
    });
  }, [points, setPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fffefa';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const screenX = (x: number) => canvas.width / 2 + (x - viewport.centerX) * viewport.scale;
    const screenY = (y: number) => canvas.height / 2 - (y - viewport.centerY) * viewport.scale;
    const step = gridStep(viewport.scale);
    const worldLeft = viewport.centerX - canvas.width / (2 * viewport.scale);
    const worldRight = viewport.centerX + canvas.width / (2 * viewport.scale);
    const worldBottom = viewport.centerY - canvas.height / (2 * viewport.scale);
    const worldTop = viewport.centerY + canvas.height / (2 * viewport.scale);
    context.font = '11px ui-monospace, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (let x = Math.ceil(worldLeft / step) * step; x <= worldRight; x += step) {
      const px = screenX(x);
      const axis = Math.abs(x) < step / 100;
      if (!showGrid && !(showAxes && axis)) continue;
      context.strokeStyle = axis ? '#8a857b' : '#dedad1';
      context.lineWidth = axis ? 1.5 : 1;
      context.beginPath(); context.moveTo(px, 0); context.lineTo(px, canvas.height); context.stroke();
      if (showAxes && !axis) { context.fillStyle = '#8a857b'; context.fillText(Number(x.toPrecision(4)).toString(), px, Math.max(3, Math.min(canvas.height - 15, screenY(0) + 4))); }
    }
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    for (let y = Math.ceil(worldBottom / step) * step; y <= worldTop; y += step) {
      const py = screenY(y);
      const axis = Math.abs(y) < step / 100;
      if (!showGrid && !(showAxes && axis)) continue;
      context.strokeStyle = axis ? '#8a857b' : '#dedad1';
      context.lineWidth = axis ? 1.5 : 1;
      context.beginPath(); context.moveTo(0, py); context.lineTo(canvas.width, py); context.stroke();
      if (showAxes && !axis) { context.fillStyle = '#8a857b'; context.fillText(Number(y.toPrecision(4)).toString(), Math.max(4, Math.min(canvas.width - 35, screenX(0) + 5)), py); }
    }
    const pointsById = new Map(points.map((point) => [point.id, point]));
    const getPoint = (id: number) => pointsById.get(id);
    const pathTo = (ids: number[], close = false) => {
      const resolved = ids.map(getPoint).filter((point): point is GeometryPoint => Boolean(point));
      if (!resolved.length) return resolved;
      context.beginPath();
      resolved.forEach((point, index) => index ? context.lineTo(screenX(point.x), screenY(point.y)) : context.moveTo(screenX(point.x), screenY(point.y)));
      if (close) context.closePath();
      return resolved;
    };
    const drawMeasurement = (text: string, x: number, y: number) => {
      if (!showMeasurements) return;
      context.font = '10px ui-monospace, monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const width = context.measureText(text).width + 8;
      context.fillStyle = 'rgba(255,254,250,.9)';
      context.fillRect(x - width / 2, y - 9, width, 18);
      context.fillStyle = '#5e5549';
      context.fillText(text, x, y);
    };
    for (const object of objects) {
      if (object.visible === false) continue;
      const selected = selectedObjectIds.includes(object.id);
      context.strokeStyle = selected ? '#c05c32' : (object.color ?? '#9a482c');
      context.fillStyle = selected ? 'rgba(192,92,50,.13)' : 'rgba(154,72,44,.09)';
      context.lineWidth = selected ? 3 : 2;
      context.setLineDash([]);
      if (object.type === 'segment' || object.type === 'vector' || object.type === 'line' || object.type === 'ray') {
        const first = getPoint(object.points[0]);
        const last = getPoint(object.points[1]);
        if (!first || !last) continue;
        const ax = screenX(first.x); const ay = screenY(first.y);
        const bx = screenX(last.x); const by = screenY(last.y);
        const dx = bx - ax; const dy = by - ay; const length = Math.hypot(dx, dy) || 1;
        context.beginPath();
        if (object.type === 'line') context.moveTo(ax - dx / length * 1400, ay - dy / length * 1400);
        else context.moveTo(ax, ay);
        if (object.type === 'segment' || object.type === 'vector') context.lineTo(bx, by);
        else context.lineTo(bx + dx / length * 1400, by + dy / length * 1400);
        context.stroke();
        if (object.type === 'vector') {
          const ux = dx / length; const uy = dy / length;
          context.beginPath(); context.moveTo(bx, by); context.lineTo(bx - ux * 12 - uy * 6, by - uy * 12 + ux * 6); context.moveTo(bx, by); context.lineTo(bx - ux * 12 + uy * 6, by - uy * 12 - ux * 6); context.stroke();
        }
        if (object.type === 'segment' || object.type === 'vector') drawMeasurement(geometryDistance(first, last).toFixed(2), (ax + bx) / 2, (ay + by) / 2 - 11);
      } else if (object.type === 'circle') {
        const center = getPoint(object.points[0]);
        const edge = getPoint(object.points[1]);
        if (!center || !edge) continue;
        const radius = geometryDistance(center, edge);
        context.beginPath(); context.arc(screenX(center.x), screenY(center.y), radius * viewport.scale, 0, Math.PI * 2); context.fill(); context.stroke();
        drawMeasurement(`r = ${radius.toFixed(2)}`, screenX(center.x), screenY(center.y) - radius * viewport.scale - 12);
      } else if (object.type === 'polygon') {
        const resolved = pathTo(object.points, true);
        context.fill(); context.stroke();
        if (resolved.length) {
          const centerX = resolved.reduce((sum, point) => sum + screenX(point.x), 0) / resolved.length;
          const centerY = resolved.reduce((sum, point) => sum + screenY(point.y), 0) / resolved.length;
          drawMeasurement(`A ${polygonArea(resolved).toFixed(2)} · P ${polygonPerimeter(resolved).toFixed(2)}`, centerX, centerY);
        }
      } else {
        const first = getPoint(object.points[0]); const vertex = getPoint(object.points[1]); const last = getPoint(object.points[2]!);
        if (!first || !vertex || !last) continue;
        const vx = screenX(vertex.x); const vy = screenY(vertex.y);
        context.beginPath(); context.moveTo(vx, vy); context.lineTo(screenX(first.x), screenY(first.y)); context.moveTo(vx, vy); context.lineTo(screenX(last.x), screenY(last.y)); context.stroke();
        const angle = angleDegrees(first, vertex, last);
        drawMeasurement(angleUnit === 'degrees' ? `${angle.toFixed(1)}°` : `${(angle * Math.PI / 180).toFixed(3)} rad`, vx + 27, vy - 20);
      }
    }
    if (showIntersections) {
      const linearObjects = objects.filter((object): object is LinearGeometryObject => (
        object.visible !== false && (object.type === 'segment' || object.type === 'vector' || object.type === 'line' || object.type === 'ray')
      ));
      const parameterOn = (point: { x: number; y: number }, start: GeometryPoint, end: GeometryPoint) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return Math.abs(dx) >= Math.abs(dy) ? (point.x - start.x) / (dx || 1) : (point.y - start.y) / (dy || 1);
      };
      const accepts = (object: typeof linearObjects[number], parameter: number) => (
        object.type === 'line' || (object.type === 'ray' ? parameter >= -1e-7 : parameter >= -1e-7 && parameter <= 1 + 1e-7)
      );
      const drawIntersection = (intersection: { x: number; y: number }) => {
        const x = screenX(intersection.x); const y = screenY(intersection.y);
        context.fillStyle = '#8e5aa4'; context.strokeStyle = '#fffefa'; context.lineWidth = 2;
        context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fill(); context.stroke();
        drawMeasurement(`(${intersection.x.toFixed(2)}, ${intersection.y.toFixed(2)})`, x, y + 15);
      };
      for (let firstIndex = 0; firstIndex < linearObjects.length; firstIndex += 1) {
        for (let lastIndex = firstIndex + 1; lastIndex < linearObjects.length; lastIndex += 1) {
          const firstObject = linearObjects[firstIndex];
          const lastObject = linearObjects[lastIndex];
          const firstStart = getPoint(firstObject.points[0]); const firstEnd = getPoint(firstObject.points[1]);
          const lastStart = getPoint(lastObject.points[0]); const lastEnd = getPoint(lastObject.points[1]);
          if (!firstStart || !firstEnd || !lastStart || !lastEnd) continue;
          const intersection = lineIntersection(firstStart, firstEnd, lastStart, lastEnd);
          if (!intersection || !accepts(firstObject, parameterOn(intersection, firstStart, firstEnd)) || !accepts(lastObject, parameterOn(intersection, lastStart, lastEnd))) continue;
          drawIntersection(intersection);
        }
      }
      const circleObjects = objects.filter((object): object is Extract<GeometryObject, { type: 'circle' }> => object.type === 'circle' && object.visible !== false);
      for (const line of linearObjects) {
        const start = getPoint(line.points[0]); const end = getPoint(line.points[1]);
        if (!start || !end) continue;
        for (const circle of circleObjects) {
          const center = getPoint(circle.points[0]); const edge = getPoint(circle.points[1]);
          if (!center || !edge) continue;
          lineCircleIntersections(start, end, center, geometryDistance(center, edge))
            .filter((intersection) => accepts(line, parameterOn(intersection, start, end)))
            .forEach(drawIntersection);
        }
      }
      for (let firstIndex = 0; firstIndex < circleObjects.length; firstIndex += 1) {
        for (let lastIndex = firstIndex + 1; lastIndex < circleObjects.length; lastIndex += 1) {
          const first = circleObjects[firstIndex]; const last = circleObjects[lastIndex];
          const firstCenter = getPoint(first.points[0]); const firstEdge = getPoint(first.points[1]);
          const lastCenter = getPoint(last.points[0]); const lastEdge = getPoint(last.points[1]);
          if (!firstCenter || !firstEdge || !lastCenter || !lastEdge) continue;
          circleCircleIntersections(firstCenter, geometryDistance(firstCenter, firstEdge), lastCenter, geometryDistance(lastCenter, lastEdge)).forEach(drawIntersection);
        }
      }
    }
    if (pendingPointIds.length) {
      const pending = pendingPointIds.map(getPoint).filter((point): point is GeometryPoint => Boolean(point));
      context.save(); context.strokeStyle = '#3777a5'; context.lineWidth = 1.5; context.setLineDash([5, 5]);
      context.beginPath();
      pending.forEach((point, index) => index ? context.lineTo(screenX(point.x), screenY(point.y)) : context.moveTo(screenX(point.x), screenY(point.y)));
      if (hoverPoint) context.lineTo(screenX(hoverPoint.x), screenY(hoverPoint.y));
      context.stroke(); context.restore();
    }
    points.forEach((point) => {
      const pending = pendingPointIds.includes(point.id);
      context.fillStyle = pending ? '#c05c32' : '#3777a5';
      context.beginPath(); context.arc(screenX(point.x), screenY(point.y), pending ? 6 : 5, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#fffefa'; context.lineWidth = 2; context.stroke();
      context.fillStyle = '#292821'; context.font = 'bold 11px ui-monospace, monospace'; context.textAlign = 'left'; context.textBaseline = 'bottom';
      context.fillText(point.label, screenX(point.x) + 7, screenY(point.y) - 6);
    });
  }, [angleUnit, hoverPoint, objects, pendingPointIds, points, selectedObjectIds, showAxes, showGrid, showIntersections, showMeasurements, viewport]);

  const pointById = (id: number) => points.find((point) => point.id === id);
  const objectDescription = (object: GeometryObject) => {
    const labels = object.points.map((id) => pointById(id)?.label ?? '?').join('');
    if (object.type === 'segment' || object.type === 'vector') {
      const first = pointById(object.points[0]); const last = pointById(object.points[1]);
      return `${object.type === 'vector' ? 'Vector' : 'Segment'} ${labels}${first && last ? ` · ${geometryDistance(first, last).toFixed(2)}` : ''}`;
    }
    if (object.type === 'circle') {
      const center = pointById(object.points[0]); const edge = pointById(object.points[1]);
      return `Circle ${labels}${center && edge ? ` · r ${geometryDistance(center, edge).toFixed(2)}` : ''}`;
    }
    if (object.type === 'polygon') {
      const vertices = object.points.map(pointById).filter((point): point is GeometryPoint => Boolean(point));
      return `Polygon ${labels} · area ${polygonArea(vertices).toFixed(2)}`;
    }
    if (object.type === 'angle') {
      const [first, vertex, last] = object.points.map(pointById);
      return `Angle ${labels}${first && vertex && last ? ` · ${angleDegrees(first, vertex, last).toFixed(1)}°` : ''}`;
    }
    return `${object.type === 'line' ? 'Line' : 'Ray'} ${labels}`;
  };

  const finishPolygon = () => {
    if (pendingPointIds.length < 3) return;
    setObjects((current) => [...current, { id: nextObjectIdRef.current++, type: 'polygon', points: [...pendingPointIds] }]);
    setPendingPointIds([]);
  };

  const deletePoint = (pointId: number) => {
    const removed = new Set([pointId]);
    let changed = true;
    while (changed) {
      changed = false;
      points.forEach((point) => {
        const constraint = point.constraint;
        if (!constraint || removed.has(point.id)) return;
        const dependencies = constraint.type === 'midpoint'
          ? constraint.sources
          : constraint.type === 'parallel-guide' || constraint.type === 'perpendicular-guide'
            ? [...constraint.sources, constraint.through]
            : constraint.type === 'compass-edge'
              ? [...constraint.sources, constraint.center]
              : [constraint.source];
        if (dependencies.some((id) => removed.has(id))) { removed.add(point.id); changed = true; }
      });
    }
    setPoints((current) => current.filter((point) => !removed.has(point.id)));
    setObjects((current) => current.filter((object) => !object.points.some((id) => removed.has(id))));
    setPendingPointIds((current) => current.filter((id) => !removed.has(id)));
  };

  const addPointAt = (coordinate: { x: number; y: number }, constraint?: GeometryConstraint) => {
    const id = nextPointIdRef.current++;
    const point = { id, ...coordinate, label: geometryPointLabel(id - 1), constraint };
    setPoints((current) => [...current, point]);
    return point;
  };

  const transformSelected = (
    transformPoint: (point: GeometryPoint) => { x: number; y: number },
    constraintFor: (sourceId: number) => GeometryConstraint,
  ) => {
    const selectedObjects = objects.filter((object) => selectedObjectIds.includes(object.id));
    if (!selectedObjects.length) return;
    const sourcePointIds = [...new Set(selectedObjects.flatMap((object) => object.points))];
    const pointMap = new Map<number, number>();
    const createdPoints: GeometryPoint[] = [];
    sourcePointIds.forEach((pointId) => {
      const source = pointById(pointId);
      if (!source) return;
      const id = nextPointIdRef.current++;
      pointMap.set(pointId, id);
      createdPoints.push({ id, ...transformPoint(source), label: geometryPointLabel(id - 1), constraint: constraintFor(source.id) });
    });
    const createdObjects = selectedObjects.map((object) => ({
      ...object,
      id: nextObjectIdRef.current++,
      points: object.points.map((pointId) => pointMap.get(pointId) ?? pointId),
      label: object.label ? `${object.label}′` : undefined,
    } as GeometryObject));
    setPoints((current) => [...current, ...createdPoints]);
    setObjects((current) => [...current, ...createdObjects]);
    setSelectedObjectIds(createdObjects.map((object) => object.id));
  };

  const executeConstructionCommand = () => {
    const command = constructionCommand.trim();
    const pointForLabel = (label: string) => points.find((point) => point.label.toLowerCase() === label.trim().toLowerCase());
    const match = command.match(/^([a-z]+)\s*\((.*)\)$/i);
    if (!match) { setCommandError('Use point(2,3), segment(A,B), midpoint(A,B), line(A,B), circle(A,B), or polygon(A,B,C).'); return; }
    const operation = match[1].toLowerCase();
    const args = match[2].split(',').map((part) => part.trim()).filter(Boolean);
    if (operation === 'point' && args.length === 2 && args.every((value) => Number.isFinite(Number(value)))) {
      addPointAt({ x: Number(args[0]), y: Number(args[1]) }); setCommandError(''); setConstructionCommand(''); return;
    }
    const resolved = args.map(pointForLabel);
    if (resolved.some((point) => !point)) { setCommandError('One or more point labels do not exist. Create the points first.'); return; }
    const ids = resolved.map((point) => point!.id);
    if (operation === 'midpoint' && resolved.length === 2) {
      addPointAt(geometryMidpoint(resolved[0]!, resolved[1]!), { type: 'midpoint', sources: [resolved[0]!.id, resolved[1]!.id] }); setCommandError(''); setConstructionCommand(''); return;
    }
    const validType = ['segment', 'vector', 'line', 'ray', 'circle', 'polygon', 'angle'].includes(operation);
    const validCount = operation === 'polygon' ? ids.length >= 3 : operation === 'angle' ? ids.length === 3 : ids.length === 2;
    if (!validType || !validCount) { setCommandError('That construction or number of point labels is not supported.'); return; }
    setObjects((current) => [...current, { id: nextObjectIdRef.current++, type: operation, points: ids } as GeometryObject]);
    setCommandError(''); setConstructionCommand('');
  };

  return (
    <section className="geometry-lab">
      <aside className="geometry-sidebar" aria-label="Geometry construction tools">
        <header><strong>Geometry</strong><span>{points.length} points · {objects.length} objects</span></header>
        <div className="geometry-tool-grid" role="toolbar" aria-label="Geometry tools">
          {GEOMETRY_TOOLS.map((entry) => <button type="button" key={entry.id} className={tool === entry.id ? 'is-active' : ''} aria-label={entry.label} aria-pressed={tool === entry.id} onClick={() => { setTool(entry.id); setPendingPointIds([]); }}><span>{entry.symbol}</span>{entry.label.replace(/ and .*/, '').replace(/Construct /, '').replace(/Add /, '')}</button>)}
        </div>
        <div className="geometry-options">
          <label><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} /> Snap to grid</label>
          <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Grid</label>
          <label><input type="checkbox" checked={showAxes} onChange={(event) => setShowAxes(event.target.checked)} /> Axes & numbers</label>
          <label><input type="checkbox" checked={showMeasurements} onChange={(event) => setShowMeasurements(event.target.checked)} /> Measurements</label>
          <label><input type="checkbox" checked={showIntersections} onChange={(event) => setShowIntersections(event.target.checked)} /> Intersections</label>
          <label><input type="checkbox" checked={lockViewport} onChange={(event) => setLockViewport(event.target.checked)} /> Lock viewport</label>
          <label>Angles <select aria-label="Geometry angle unit" value={angleUnit} onChange={(event) => setAngleUnit(event.target.value as 'degrees' | 'radians')}><option value="degrees">Degrees</option><option value="radians">Radians</option></select></label>
        </div>
        <div className="geometry-command">
          <label>Construction expression<input aria-label="Geometry construction expression" placeholder="segment(A,B)" value={constructionCommand} onChange={(event) => setConstructionCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') executeConstructionCommand(); }} /></label>
          <button type="button" onClick={executeConstructionCommand}>Add</button>
          {commandError && <p>{commandError}</p>}
        </div>
        {tool === 'polygon' && pendingPointIds.length > 0 && <button type="button" className="geometry-finish" disabled={pendingPointIds.length < 3} onClick={finishPolygon}>Finish polygon ({pendingPointIds.length})</button>}
        {pendingPointIds.length > 0 && <p className="geometry-instruction">Selected {pendingPointIds.map((id) => pointById(id)?.label).join(' → ')}. Choose the next point.</p>}
        <div className="geometry-object-list" aria-label="Geometry objects">
          <strong>Objects</strong>
          {!objects.length && <p>Choose a tool, then construct directly on the coordinate plane.</p>}
          {objects.map((object) => <button type="button" key={object.id} className={selectedObjectIds.includes(object.id) ? 'is-selected' : ''} aria-pressed={selectedObjectIds.includes(object.id)} onClick={(event) => setSelectedObjectIds((current) => event.shiftKey ? (current.includes(object.id) ? current.filter((id) => id !== object.id) : [...current, object.id]) : [object.id])}>{object.visible === false ? 'Hidden · ' : ''}{objectDescription(object)}</button>)}
        </div>
        {selectedObjectIds.length > 0 && <section className="geometry-selection-panel" aria-label="Selected geometry controls">
          <header><strong>{selectedObjectIds.length} selected</strong><button type="button" onClick={() => setSelectedObjectIds([])}>Clear</button></header>
          <div className="geometry-selection-style">
            <label>Color <input type="color" aria-label="Selected geometry color" value={objects.find((object) => selectedObjectIds.includes(object.id))?.color ?? '#9a482c'} onChange={(event) => setObjects((current) => current.map((object) => selectedObjectIds.includes(object.id) ? { ...object, color: event.target.value } : object))} /></label>
            <button type="button" onClick={() => setObjects((current) => current.map((object) => selectedObjectIds.includes(object.id) ? { ...object, visible: object.visible === false } : object))}>{objects.filter((object) => selectedObjectIds.includes(object.id)).every((object) => object.visible === false) ? 'Show' : 'Hide'}</button>
          </div>
          <div className="geometry-transform-grid">
            <label>dx <input type="number" step="0.25" value={transform.dx} onChange={(event) => setTransform((current) => ({ ...current, dx: Number(event.target.value) }))} /></label>
            <label>dy <input type="number" step="0.25" value={transform.dy} onChange={(event) => setTransform((current) => ({ ...current, dy: Number(event.target.value) }))} /></label>
            <button type="button" onClick={() => transformSelected((point) => translateCoordinate(point, transform.dx, transform.dy), (source) => ({ type: 'translate', source, dx: transform.dx, dy: transform.dy }))}>Translate copy</button>
            <label>angle <input type="number" step="1" value={transform.angle} onChange={(event) => setTransform((current) => ({ ...current, angle: Number(event.target.value) }))} /></label>
            <button type="button" onClick={() => transformSelected((point) => rotateCoordinate(point, { x: 0, y: 0 }, transform.angle), (source) => ({ type: 'rotate', source, angle: transform.angle }))}>Rotate copy</button>
            <label>scale <input type="number" step="0.1" value={transform.scale} onChange={(event) => setTransform((current) => ({ ...current, scale: Number(event.target.value) }))} /></label>
            <button type="button" onClick={() => transformSelected((point) => dilateCoordinate(point, { x: 0, y: 0 }, transform.scale), (source) => ({ type: 'dilate', source, scale: transform.scale }))}>Dilate copy</button>
            <button type="button" onClick={() => transformSelected((point) => reflectCoordinate(point, 'x'), (source) => ({ type: 'reflect', source, axis: 'x' }))}>Reflect x</button>
            <button type="button" onClick={() => transformSelected((point) => reflectCoordinate(point, 'y'), (source) => ({ type: 'reflect', source, axis: 'y' }))}>Reflect y</button>
          </div>
        </section>}
        <div className="geometry-point-list" aria-label="Editable geometry points">
          <strong>Points</strong>
          {points.map((point) => <div key={point.id} title={point.constraint ? `Constrained: ${point.constraint.type}` : 'Free point'}><b>{point.label}{point.constraint ? '◇' : ''}</b><label>x <input type="number" step="0.25" disabled={Boolean(point.constraint)} aria-label={`Point ${point.label} x coordinate`} value={Number(point.x.toFixed(4))} onChange={(event) => setPoints((current) => current.map((entry) => entry.id === point.id ? { ...entry, x: Number(event.target.value) } : entry))} /></label><label>y <input type="number" step="0.25" disabled={Boolean(point.constraint)} aria-label={`Point ${point.label} y coordinate`} value={Number(point.y.toFixed(4))} onChange={(event) => setPoints((current) => current.map((entry) => entry.id === point.id ? { ...entry, y: Number(event.target.value) } : entry))} /></label></div>)}
        </div>
        <div className="geometry-history-actions">
          <button type="button" disabled={!pendingPointIds.length && !objects.length && !points.length} onClick={() => {
            if (pendingPointIds.length) setPendingPointIds((current) => current.slice(0, -1));
            else if (objects.length) setObjects((current) => current.slice(0, -1));
            else setPoints((current) => current.slice(0, -1));
          }}>Undo</button>
          <button type="button" disabled={!selectedObjectIds.length} onClick={() => { setObjects((current) => current.filter((object) => !selectedObjectIds.includes(object.id))); setSelectedObjectIds([]); }}>Delete selected</button>
          <button type="button" disabled={!points.length && !objects.length} onClick={() => { setPoints([]); setObjects([]); setPendingPointIds([]); setSelectedObjectIds([]); nextPointIdRef.current = 1; nextObjectIdRef.current = 1; }}>Clear all</button>
        </div>
      </aside>
      <div className="geometry-stage">
        <div className="graph-controls" aria-label="Geometry view controls">
          <button type="button" aria-label="Zoom geometry in" disabled={lockViewport} onClick={() => setViewport((view) => ({ ...view, scale: Math.min(180, view.scale * 1.25) }))}>+</button>
          <button type="button" aria-label="Zoom geometry out" disabled={lockViewport} onClick={() => setViewport((view) => ({ ...view, scale: Math.max(16, view.scale / 1.25) }))}>−</button>
          <button type="button" aria-label="Reset geometry view" onClick={() => setViewport({ centerX: 0, centerY: 0, scale: 42 })}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          aria-label="Interactive geometry canvas"
          data-tool={tool}
          onPointerDown={(event) => {
            const canvas = event.currentTarget;
            const bounds = canvas.getBoundingClientRect();
            const pixelX = (event.clientX - bounds.left) * canvas.width / bounds.width;
            const pixelY = (event.clientY - bounds.top) * canvas.height / bounds.height;
            const world = {
              x: viewport.centerX + (pixelX - canvas.width / 2) / viewport.scale,
              y: viewport.centerY - (pixelY - canvas.height / 2) / viewport.scale,
            };
            const snapStep = Math.max(.25, gridStep(viewport.scale) / 4);
            const snapped = snap ? { x: Math.round(world.x / snapStep) * snapStep, y: Math.round(world.y / snapStep) * snapStep } : world;
            const hit = points.find((point) => Math.hypot((point.x - world.x) * viewport.scale, (point.y - world.y) * viewport.scale) <= 10);
            if (tool === 'move') {
              if (hit?.constraint) return;
              if (lockViewport && !hit) return;
              canvas.setPointerCapture(event.pointerId);
              dragRef.current = hit
                ? { kind: 'point', pointId: hit.id }
                : { kind: 'pan', x: event.clientX, y: event.clientY, centerX: viewport.centerX, centerY: viewport.centerY };
              return;
            }
            if (tool === 'delete') {
              if (hit) { deletePoint(hit.id); return; }
              const threshold = 10 / viewport.scale;
              const distanceToPath = (start: GeometryPoint, end: GeometryPoint, mode: 'segment' | 'line' | 'ray') => {
                const dx = end.x - start.x; const dy = end.y - start.y;
                const denominator = dx * dx + dy * dy || 1;
                let parameter = ((world.x - start.x) * dx + (world.y - start.y) * dy) / denominator;
                if (mode === 'segment') parameter = Math.max(0, Math.min(1, parameter));
                if (mode === 'ray') parameter = Math.max(0, parameter);
                return Math.hypot(world.x - (start.x + parameter * dx), world.y - (start.y + parameter * dy));
              };
              const hitObject = [...objects].reverse().find((object) => {
                const vertices = object.points.map(pointById).filter((entry): entry is GeometryPoint => Boolean(entry));
                if (object.type === 'segment' || object.type === 'vector' || object.type === 'line' || object.type === 'ray') return vertices.length === 2 && distanceToPath(vertices[0], vertices[1], object.type === 'vector' ? 'segment' : object.type) <= threshold;
                if (object.type === 'circle') return vertices.length === 2 && Math.abs(geometryDistance(vertices[0], world) - geometryDistance(vertices[0], vertices[1])) <= threshold;
                if (object.type === 'angle') return vertices.length === 3 && (distanceToPath(vertices[1], vertices[0], 'segment') <= threshold || distanceToPath(vertices[1], vertices[2], 'segment') <= threshold);
                return vertices.some((vertex, index) => distanceToPath(vertex, vertices[(index + 1) % vertices.length], 'segment') <= threshold);
              });
              if (hitObject) {
                setObjects((current) => current.filter((object) => object.id !== hitObject.id));
                setSelectedObjectIds((current) => current.filter((id) => id !== hitObject.id));
              }
              return;
            }
            let point = hit;
            if (!point) {
              const pointId = nextPointIdRef.current++;
              point = { id: pointId, x: snapped.x, y: snapped.y, label: geometryPointLabel(pointId - 1) };
              setPoints((current) => [...current, point!]);
            }
            if (tool === 'point') return;
            if (tool === 'polygon' && pendingPointIds.length >= 3 && point.id === pendingPointIds[0]) { finishPolygon(); return; }
            if (pendingPointIds.includes(point.id)) return;
            const needed = tool === 'angle' || tool === 'parallel' || tool === 'perpendicular' || tool === 'compass' ? 3 : 2;
            const nextPending = [...pendingPointIds, point.id];
            if (tool === 'polygon') { if (!pendingPointIds.includes(point.id)) setPendingPointIds(nextPending); return; }
            if (nextPending.length < needed) { setPendingPointIds(nextPending); return; }
            const selectedPoints = nextPending.map((id) => id === point!.id ? point! : pointById(id)).filter((entry): entry is GeometryPoint => Boolean(entry));
            if (tool === 'midpoint' && selectedPoints.length === 2) {
              addPointAt(geometryMidpoint(selectedPoints[0], selectedPoints[1]), { type: 'midpoint', sources: [selectedPoints[0].id, selectedPoints[1].id] });
              setPendingPointIds([]);
              return;
            }
            if ((tool === 'parallel' || tool === 'perpendicular') && selectedPoints.length === 3) {
              const [start, end, through] = selectedPoints;
              const dx = end.x - start.x; const dy = end.y - start.y;
              const length = Math.hypot(dx, dy) || 1;
              const direction = tool === 'parallel' ? { x: dx / length, y: dy / length } : { x: -dy / length, y: dx / length };
              const guide = addPointAt({ x: through.x + direction.x * 3, y: through.y + direction.y * 3 }, { type: tool === 'parallel' ? 'parallel-guide' : 'perpendicular-guide', sources: [start.id, end.id], through: through.id, length: 3 });
              setObjects((current) => [...current, { id: nextObjectIdRef.current++, type: 'line', points: [through.id, guide.id] }]);
              setPendingPointIds([]);
              return;
            }
            if (tool === 'compass' && selectedPoints.length === 3) {
              const radius = geometryDistance(selectedPoints[0], selectedPoints[1]);
              const center = selectedPoints[2];
              const edge = addPointAt({ x: center.x + radius, y: center.y }, { type: 'compass-edge', sources: [selectedPoints[0].id, selectedPoints[1].id], center: center.id });
              setObjects((current) => [...current, { id: nextObjectIdRef.current++, type: 'circle', points: [center.id, edge.id] }]);
              setPendingPointIds([]);
              return;
            }
            setObjects((current) => [...current, {
              id: nextObjectIdRef.current++,
              type: tool,
              points: nextPending as [number, number] & [number, number, number],
            } as GeometryObject]);
            setPendingPointIds([]);
          }}
          onPointerMove={(event) => {
            const canvas = event.currentTarget;
            const bounds = canvas.getBoundingClientRect();
            const ratioX = canvas.width / bounds.width;
            const ratioY = canvas.height / bounds.height;
            if (dragRef.current?.kind === 'point') {
              const world = {
                x: viewport.centerX + ((event.clientX - bounds.left) * ratioX - canvas.width / 2) / viewport.scale,
                y: viewport.centerY - ((event.clientY - bounds.top) * ratioY - canvas.height / 2) / viewport.scale,
              };
              const snapStep = Math.max(.25, gridStep(viewport.scale) / 4);
              const next = snap ? { x: Math.round(world.x / snapStep) * snapStep, y: Math.round(world.y / snapStep) * snapStep } : world;
              const pointId = dragRef.current.pointId;
              setPoints((current) => current.map((point) => point.id === pointId ? { ...point, ...next } : point));
              return;
            }
            if (dragRef.current?.kind === 'pan') {
              const drag = dragRef.current;
              setViewport((view) => ({ ...view, centerX: drag.centerX - (event.clientX - drag.x) * ratioX / view.scale, centerY: drag.centerY + (event.clientY - drag.y) * ratioY / view.scale }));
              return;
            }
            setHoverPoint({
              x: viewport.centerX + ((event.clientX - bounds.left) * ratioX - canvas.width / 2) / viewport.scale,
              y: viewport.centerY - ((event.clientY - bounds.top) * ratioY - canvas.height / 2) / viewport.scale,
            });
          }}
          onPointerUp={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { dragRef.current = null; }}
          onPointerLeave={() => { if (!dragRef.current) setHoverPoint(null); }}
          onWheel={(event) => {
            event.preventDefault();
            if (lockViewport) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const px = (event.clientX - bounds.left) * event.currentTarget.width / bounds.width;
            const py = (event.clientY - bounds.top) * event.currentTarget.height / bounds.height;
            setViewport((view) => {
              const worldX = view.centerX + (px - event.currentTarget.width / 2) / view.scale;
              const worldY = view.centerY - (py - event.currentTarget.height / 2) / view.scale;
              const scale = Math.max(16, Math.min(180, view.scale * Math.exp(-event.deltaY * .0015)));
              return { centerX: worldX - (px - event.currentTarget.width / 2) / scale, centerY: worldY + (py - event.currentTarget.height / 2) / scale, scale };
            });
          }}
        />
        {hoverPoint && <output className="geometry-coordinates">x = {hoverPoint.x.toFixed(2)} · y = {hoverPoint.y.toFixed(2)}</output>}
      </div>
    </section>
  );
}

function ScientificLab() {
  const [expression, setExpression] = useState('sin(pi/4)^2 + cos(pi/4)^2');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  async function calculate() {
    try {
      const { default: nerdamer } = await import('nerdamer-prime');
      const exact = nerdamer(expression).evaluate();
      setResult(`${exact.toString()}  ≈  ${exact.text('decimals')}`);
      setError('');
    } catch {
      setResult('');
      setError('Check the scientific expression and parentheses.');
    }
  }
  const insert = (value: string) => setExpression((current) => `${current}${value}`);
  return (
    <section className="scientific-lab">
      <label>Scientific expression<textarea rows={3} value={expression} onChange={(event) => setExpression(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void calculate(); } }} /></label>
      <div className="scientific-keys">
        {['sin(', 'cos(', 'tan(', 'log(', 'exp(', 'sqrt(', 'abs(', 'pi', 'e', '^2', '!', '(', ')'].map((key) => <button type="button" key={key} onClick={() => insert(key)}>{key}</button>)}
      </div>
      <button type="button" className="research-primary" onClick={() => void calculate()}>Calculate exactly and numerically</button>
      {result && <output>{result}</output>}
      {error && <p className="research-tool-error">{error}</p>}
    </section>
  );
}

export function ResearchToolsPanel({ initialTool = '2d', onClose, open = true, notebookId = 'default' }: { initialTool?: ResearchTool; onClose: () => void; open?: boolean; notebookId?: string }) {
  const storagePrefix = `mathkhata:research:${notebookId}`;
  const [tool, setTool] = usePersistentResearchState<ResearchTool>(`${storagePrefix}:tool`, initialTool);
  useEffect(() => {
    if (!open) return undefined;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [onClose, open]);
  const footer = tool === '3d'
    ? 'Local interactive 3D: explicit, parametric, and sampled implicit surfaces; sliders, points, curves, traces, viewport locks, and sampled intersections.'
    : tool === 'geometry'
      ? 'Local dynamic geometry: constructions, expressions, multi-select styling, transformations, dragging, measurements, and line/circle intersections.'
      : 'All calculations run locally. Verify research-critical results with the checked solver or AION.';
  return (
    <aside className="research-tools-panel" aria-label="Research mathematics tools" data-testid="research-tools-panel" hidden={!open}>
      <header><div><strong>Research workspace</strong><span>Graph · geometry · scientific</span></div><button type="button" aria-label="Close research tools" onClick={onClose}>×</button></header>
      <nav aria-label="Research tool sections">{TABS.map((tab) => <button type="button" key={tab.id} className={tool === tab.id ? 'is-active' : ''} onClick={() => setTool(tab.id)}>{tab.label}</button>)}</nav>
      <div className="research-tools-panel__body">
        {tool === '2d' && <Graph2D storagePrefix={storagePrefix} />}
        {tool === '3d' && <Graph3D storagePrefix={storagePrefix} />}
        {tool === 'geometry' && <GeometryLab storagePrefix={storagePrefix} />}
        {tool === 'scientific' && <ScientificLab />}
      </div>
      <footer>{footer}</footer>
    </aside>
  );
}
