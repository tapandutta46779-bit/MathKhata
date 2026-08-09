import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  angleDegrees,
  geometryDistance,
  geometryPointLabel,
  lineIntersection,
  polygonArea,
  polygonPerimeter,
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
          evaluate: await numericEvaluator(entry.expression),
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
  const [domain, setDomain] = usePersistentResearchState(`${storagePrefix}:3d:domain`, 5);
  const [resolution, setResolution] = usePersistentResearchState(`${storagePrefix}:3d:resolution`, 29);
  const [camera, setCamera] = usePersistentResearchState(`${storagePrefix}:3d:camera`, { yaw: -.72, pitch: -.58, zoom: 1 });
  const [renderMode, setRenderMode] = usePersistentResearchState<SurfaceRenderMode>(`${storagePrefix}:3d:render`, 'solid');
  const [projection, setProjection] = usePersistentResearchState<SurfaceProjection>(`${storagePrefix}:3d:projection`, 'perspective');
  const [showAxes, setShowAxes] = usePersistentResearchState(`${storagePrefix}:3d:axes`, true);
  const [showGrid, setShowGrid] = usePersistentResearchState(`${storagePrefix}:3d:grid`, true);
  const [showSurfaceIntersections, setShowSurfaceIntersections] = usePersistentResearchState(`${storagePrefix}:3d:intersections`, true);
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
          const cameraDistance = domain * 5.5;
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

        const reservedParameters = new Set(['x', 'y', 'z', 't']);
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
        const tracePoints: typeof tracePointsRef.current = [];
        const issues: string[] = invalidParameters.length ? ['Slider names cannot be x, y, z, or t.'] : [];
        const surfaceSamples: Array<{
          surface: SurfaceExpression;
          grid: Array<Array<{ x: number; y: number; z: number; depth: number; worldX: number; worldY: number; rawZ: number }>>;
        }> = [];
        const active = surfaces.filter((surface) => surface.visible && surface.expression.trim());
        for (const [surfaceIndex, surface] of active.entries()) {
          try {
            const evaluate = await numericEvaluator(surface.expression);
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
  }, [camera, curves3D, domain, parameters, points3D, projection, renderMode, resolution, showAxes, showGrid, showSurfaceIntersections, surfaces]);

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
        <header><strong>3D expressions</strong><span>{surfaces.length}/4</span></header>
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
        <section className="graph-parameter-section" aria-label="3D graph parameters">
          <header><strong>Parameters</strong><span>Use names in any expression</span></header>
          {parameters.map((parameter, index) => <div className="graph-parameter" key={parameter.id}>
            <div><input className="parameter-name" aria-label={`Parameter ${index + 1} name`} value={parameter.name} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, name: event.target.value.replace(/[^a-zA-Z0-9_]/g, '') } : entry))} /><output>{parameter.value.toFixed(2)}</output><button type="button" aria-label={`Remove parameter ${parameter.name}`} onClick={() => setParameters((current) => current.filter((entry) => entry.id !== parameter.id))}>×</button></div>
            <input type="range" aria-label={`Parameter ${parameter.name} value`} min={parameter.min} max={parameter.max} step={parameter.step} value={parameter.value} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, value: Number(event.target.value) } : entry))} />
            <div className="parameter-range"><label>min <input type="number" value={parameter.min} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, min: Number(event.target.value) } : entry))} /></label><label>max <input type="number" value={parameter.max} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, max: Number(event.target.value) } : entry))} /></label></div>
          </div>)}
          <button type="button" className="graph-add-expression" disabled={parameters.length >= 4} onClick={() => setParameters((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, name: ['a', 'b', 'c', 'd'].find((name) => !current.some((entry) => entry.name === name)) ?? `p${current.length + 1}`, value: 1, min: -5, max: 5, step: .1 }])}>+ Add slider</button>
        </section>
        <section className="graph-3d-object-section" aria-label="3D points and curves">
          <header><strong>Points & curves</strong><span>{points3D.length + curves3D.length}</span></header>
          {points3D.map((point, index) => <div className="graph-3d-object-card" key={`point-${point.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${point.visible ? ' is-visible' : ''}`} style={{ '--graph-color': point.color } as React.CSSProperties} aria-label={`${point.visible ? 'Hide' : 'Show'} 3D point ${index + 1}`} onClick={() => setPoints3D((current) => current.map((entry) => entry.id === point.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>P{index + 1}</strong><button type="button" aria-label={`Remove 3D point ${index + 1}`} onClick={() => setPoints3D((current) => current.filter((entry) => entry.id !== point.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis} = <input aria-label={`3D point ${index + 1} ${axis} coordinate`} value={point[axis]} onChange={(event) => setPoints3D((current) => current.map((entry) => entry.id === point.id ? { ...entry, [axis]: event.target.value } : entry))} /></label>)}</div>
          </div>)}
          {curves3D.map((curve, index) => <div className="graph-3d-object-card" key={`curve-${curve.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${curve.visible ? ' is-visible' : ''}`} style={{ '--graph-color': curve.color } as React.CSSProperties} aria-label={`${curve.visible ? 'Hide' : 'Show'} 3D curve ${index + 1}`} onClick={() => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>C{index + 1}(t)</strong><button type="button" aria-label={`Remove 3D curve ${index + 1}`} onClick={() => setCurves3D((current) => current.filter((entry) => entry.id !== curve.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis}(t) = <input aria-label={`3D curve ${index + 1} ${axis} expression`} value={curve[axis]} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, [axis]: event.target.value } : entry))} /></label>)}</div>
            <div className="curve-domain"><label>t min <input type="number" step="0.1" value={curve.tMin} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, tMin: Number(event.target.value) } : entry))} /></label><label>t max <input type="number" step="0.1" value={curve.tMax} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, tMax: Number(event.target.value) } : entry))} /></label></div>
          </div>)}
          <div className="graph-object-adders"><button type="button" onClick={() => setPoints3D((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, x: '1', y: '1', z: '1', color: GRAPH_COLORS[(surfaces.length + current.length) % GRAPH_COLORS.length], visible: true }])}>+ Point</button><button type="button" onClick={() => setCurves3D((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, x: 'cos(t)', y: 'sin(t)', z: 't/3', tMin: -6.28, tMax: 6.28, color: GRAPH_COLORS[(surfaces.length + points3D.length + current.length) % GRAPH_COLORS.length], visible: true }])}>+ Parametric curve</button></div>
        </section>
        <div className="surface-view-options">
          <label>Rendering<select aria-label="3D rendering style" value={renderMode} onChange={(event) => setRenderMode(event.target.value as SurfaceRenderMode)}><option value="solid">Solid + mesh</option><option value="mesh">Wire mesh</option><option value="contours">Contour mesh</option></select></label>
          <label>Projection<select aria-label="3D projection" value={projection} onChange={(event) => setProjection(event.target.value as SurfaceProjection)}><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
          <label><input type="checkbox" checked={showAxes} onChange={(event) => setShowAxes(event.target.checked)} /> Axes</label>
          <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Ground grid</label>
          <label><input type="checkbox" checked={showSurfaceIntersections} onChange={(event) => setShowSurfaceIntersections(event.target.checked)} /> Surface intersections</label>
        </div>
        <label className="graph-slider">Domain ±{domain}<input type="range" min="2" max="12" step="1" value={domain} onChange={(event) => setDomain(Number(event.target.value))} /></label>
        <label className="graph-slider">Mesh {resolution}×{resolution}<input type="range" min="17" max="45" step="2" value={resolution} onChange={(event) => setResolution(Number(event.target.value))} /></label>
        <div className="surface-presets" aria-label="3D camera presets">
          <button type="button" onClick={() => setCameraPreset('iso')}>Perspective</button>
          <button type="button" onClick={() => setCameraPreset('top')}>Top</button>
          <button type="button" onClick={() => setCameraPreset('front')}>Front</button>
          <button type="button" onClick={() => setCameraPreset('side')}>Side</button>
        </div>
        <p>Drag to orbit · wheel to zoom · hover to inspect coordinates</p>
      </aside>
      <div className="graph-stage">
        <div className="graph-controls" aria-label="3D graph view controls">
          <button type="button" aria-label="Zoom 3D view in" onClick={() => setCamera((view) => ({ ...view, zoom: Math.min(2.6, view.zoom * 1.2) }))}>+</button>
          <button type="button" aria-label="Zoom 3D view out" onClick={() => setCamera((view) => ({ ...view, zoom: Math.max(.45, view.zoom / 1.2) }))}>−</button>
          <button type="button" aria-label="Reset 3D view" onClick={() => setCameraPreset('iso')}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          aria-label="Interactive 3D graph"
          onPointerDown={(event) => {
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
            setCamera((view) => ({ ...view, zoom: Math.max(.45, Math.min(2.6, view.zoom * Math.exp(-event.deltaY * .0015))) }));
          }}
        />
        {trace && <output className="graph-trace graph-trace--3d" style={{ '--graph-color': trace.color } as React.CSSProperties}>x = {trace.x.toFixed(3)} · y = {trace.y.toFixed(3)} · z = {trace.z.toFixed(3)}</output>}
        {error && <p className="research-tool-error graph-error">{error}</p>}
      </div>
    </section>
  );
}

interface GeometryPoint { id: number; x: number; y: number; label: string }
type GeometryTool = 'move' | 'point' | 'segment' | 'line' | 'ray' | 'circle' | 'polygon' | 'angle' | 'delete';
type LinearGeometryObject = { id: number; type: 'segment' | 'line' | 'ray'; points: [number, number] };
type GeometryObject =
  | LinearGeometryObject
  | { id: number; type: 'circle'; points: [number, number] }
  | { id: number; type: 'polygon'; points: number[] }
  | { id: number; type: 'angle'; points: [number, number, number] };

const GEOMETRY_TOOLS: Array<{ id: GeometryTool; label: string; symbol: string }> = [
  { id: 'move', label: 'Move points and pan', symbol: '↖' },
  { id: 'point', label: 'Add point', symbol: '•' },
  { id: 'segment', label: 'Construct segment', symbol: '╱' },
  { id: 'line', label: 'Construct line', symbol: '↔' },
  { id: 'ray', label: 'Construct ray', symbol: '→' },
  { id: 'circle', label: 'Construct circle', symbol: '○' },
  { id: 'polygon', label: 'Construct polygon', symbol: '△' },
  { id: 'angle', label: 'Measure angle', symbol: '∠' },
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
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
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
      context.strokeStyle = Math.abs(x) < step / 100 ? '#8a857b' : '#dedad1';
      context.lineWidth = Math.abs(x) < step / 100 ? 1.5 : 1;
      context.beginPath(); context.moveTo(px, 0); context.lineTo(px, canvas.height); context.stroke();
      if (Math.abs(x) > step / 100) { context.fillStyle = '#8a857b'; context.fillText(Number(x.toPrecision(4)).toString(), px, Math.max(3, Math.min(canvas.height - 15, screenY(0) + 4))); }
    }
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    for (let y = Math.ceil(worldBottom / step) * step; y <= worldTop; y += step) {
      const py = screenY(y);
      context.strokeStyle = Math.abs(y) < step / 100 ? '#8a857b' : '#dedad1';
      context.lineWidth = Math.abs(y) < step / 100 ? 1.5 : 1;
      context.beginPath(); context.moveTo(0, py); context.lineTo(canvas.width, py); context.stroke();
      if (Math.abs(y) > step / 100) { context.fillStyle = '#8a857b'; context.fillText(Number(y.toPrecision(4)).toString(), Math.max(4, Math.min(canvas.width - 35, screenX(0) + 5)), py); }
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
      const selected = object.id === selectedObjectId;
      context.strokeStyle = selected ? '#c05c32' : '#9a482c';
      context.fillStyle = selected ? 'rgba(192,92,50,.13)' : 'rgba(154,72,44,.09)';
      context.lineWidth = selected ? 3 : 2;
      context.setLineDash([]);
      if (object.type === 'segment' || object.type === 'line' || object.type === 'ray') {
        const first = getPoint(object.points[0]);
        const last = getPoint(object.points[1]);
        if (!first || !last) continue;
        const ax = screenX(first.x); const ay = screenY(first.y);
        const bx = screenX(last.x); const by = screenY(last.y);
        const dx = bx - ax; const dy = by - ay; const length = Math.hypot(dx, dy) || 1;
        context.beginPath();
        if (object.type === 'line') context.moveTo(ax - dx / length * 1400, ay - dy / length * 1400);
        else context.moveTo(ax, ay);
        if (object.type === 'segment') context.lineTo(bx, by);
        else context.lineTo(bx + dx / length * 1400, by + dy / length * 1400);
        context.stroke();
        if (object.type === 'segment') drawMeasurement(geometryDistance(first, last).toFixed(2), (ax + bx) / 2, (ay + by) / 2 - 11);
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
        drawMeasurement(`${angleDegrees(first, vertex, last).toFixed(1)}°`, vx + 27, vy - 20);
      }
    }
    if (showIntersections) {
      const linearObjects = objects.filter((object): object is LinearGeometryObject => (
        object.type === 'segment' || object.type === 'line' || object.type === 'ray'
      ));
      const parameterOn = (point: { x: number; y: number }, start: GeometryPoint, end: GeometryPoint) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return Math.abs(dx) >= Math.abs(dy) ? (point.x - start.x) / (dx || 1) : (point.y - start.y) / (dy || 1);
      };
      const accepts = (object: typeof linearObjects[number], parameter: number) => (
        object.type === 'line' || (object.type === 'ray' ? parameter >= -1e-7 : parameter >= -1e-7 && parameter <= 1 + 1e-7)
      );
      for (let firstIndex = 0; firstIndex < linearObjects.length; firstIndex += 1) {
        for (let lastIndex = firstIndex + 1; lastIndex < linearObjects.length; lastIndex += 1) {
          const firstObject = linearObjects[firstIndex];
          const lastObject = linearObjects[lastIndex];
          const firstStart = getPoint(firstObject.points[0]); const firstEnd = getPoint(firstObject.points[1]);
          const lastStart = getPoint(lastObject.points[0]); const lastEnd = getPoint(lastObject.points[1]);
          if (!firstStart || !firstEnd || !lastStart || !lastEnd) continue;
          const intersection = lineIntersection(firstStart, firstEnd, lastStart, lastEnd);
          if (!intersection || !accepts(firstObject, parameterOn(intersection, firstStart, firstEnd)) || !accepts(lastObject, parameterOn(intersection, lastStart, lastEnd))) continue;
          const x = screenX(intersection.x); const y = screenY(intersection.y);
          context.fillStyle = '#8e5aa4'; context.strokeStyle = '#fffefa'; context.lineWidth = 2;
          context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fill(); context.stroke();
          drawMeasurement(`(${intersection.x.toFixed(2)}, ${intersection.y.toFixed(2)})`, x, y + 15);
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
  }, [hoverPoint, objects, pendingPointIds, points, selectedObjectId, showIntersections, showMeasurements, viewport]);

  const pointById = (id: number) => points.find((point) => point.id === id);
  const objectDescription = (object: GeometryObject) => {
    const labels = object.points.map((id) => pointById(id)?.label ?? '?').join('');
    if (object.type === 'segment') {
      const first = pointById(object.points[0]); const last = pointById(object.points[1]);
      return `Segment ${labels}${first && last ? ` · ${geometryDistance(first, last).toFixed(2)}` : ''}`;
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
    setPoints((current) => current.filter((point) => point.id !== pointId));
    setObjects((current) => current.filter((object) => !object.points.includes(pointId)));
    setPendingPointIds((current) => current.filter((id) => id !== pointId));
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
          <label><input type="checkbox" checked={showMeasurements} onChange={(event) => setShowMeasurements(event.target.checked)} /> Measurements</label>
          <label><input type="checkbox" checked={showIntersections} onChange={(event) => setShowIntersections(event.target.checked)} /> Intersections</label>
        </div>
        {tool === 'polygon' && pendingPointIds.length > 0 && <button type="button" className="geometry-finish" disabled={pendingPointIds.length < 3} onClick={finishPolygon}>Finish polygon ({pendingPointIds.length})</button>}
        {pendingPointIds.length > 0 && <p className="geometry-instruction">Selected {pendingPointIds.map((id) => pointById(id)?.label).join(' → ')}. Choose the next point.</p>}
        <div className="geometry-object-list" aria-label="Geometry objects">
          <strong>Objects</strong>
          {!objects.length && <p>Choose a tool, then construct directly on the coordinate plane.</p>}
          {objects.map((object) => <button type="button" key={object.id} className={selectedObjectId === object.id ? 'is-selected' : ''} onClick={() => setSelectedObjectId(object.id)}>{objectDescription(object)}</button>)}
        </div>
        <div className="geometry-point-list" aria-label="Editable geometry points">
          <strong>Points</strong>
          {points.map((point) => <div key={point.id}><b>{point.label}</b><label>x <input type="number" step="0.25" aria-label={`Point ${point.label} x coordinate`} value={Number(point.x.toFixed(4))} onChange={(event) => setPoints((current) => current.map((entry) => entry.id === point.id ? { ...entry, x: Number(event.target.value) } : entry))} /></label><label>y <input type="number" step="0.25" aria-label={`Point ${point.label} y coordinate`} value={Number(point.y.toFixed(4))} onChange={(event) => setPoints((current) => current.map((entry) => entry.id === point.id ? { ...entry, y: Number(event.target.value) } : entry))} /></label></div>)}
        </div>
        <div className="geometry-history-actions">
          <button type="button" disabled={!pendingPointIds.length && !objects.length && !points.length} onClick={() => {
            if (pendingPointIds.length) setPendingPointIds((current) => current.slice(0, -1));
            else if (objects.length) setObjects((current) => current.slice(0, -1));
            else setPoints((current) => current.slice(0, -1));
          }}>Undo</button>
          <button type="button" disabled={selectedObjectId === null} onClick={() => { setObjects((current) => current.filter((object) => object.id !== selectedObjectId)); setSelectedObjectId(null); }}>Delete selected</button>
          <button type="button" disabled={!points.length && !objects.length} onClick={() => { setPoints([]); setObjects([]); setPendingPointIds([]); setSelectedObjectId(null); nextPointIdRef.current = 1; nextObjectIdRef.current = 1; }}>Clear all</button>
        </div>
      </aside>
      <div className="geometry-stage">
        <div className="graph-controls" aria-label="Geometry view controls">
          <button type="button" aria-label="Zoom geometry in" onClick={() => setViewport((view) => ({ ...view, scale: Math.min(180, view.scale * 1.25) }))}>+</button>
          <button type="button" aria-label="Zoom geometry out" onClick={() => setViewport((view) => ({ ...view, scale: Math.max(16, view.scale / 1.25) }))}>−</button>
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
                if (object.type === 'segment' || object.type === 'line' || object.type === 'ray') return vertices.length === 2 && distanceToPath(vertices[0], vertices[1], object.type) <= threshold;
                if (object.type === 'circle') return vertices.length === 2 && Math.abs(geometryDistance(vertices[0], world) - geometryDistance(vertices[0], vertices[1])) <= threshold;
                if (object.type === 'angle') return vertices.length === 3 && (distanceToPath(vertices[1], vertices[0], 'segment') <= threshold || distanceToPath(vertices[1], vertices[2], 'segment') <= threshold);
                return vertices.some((vertex, index) => distanceToPath(vertex, vertices[(index + 1) % vertices.length], 'segment') <= threshold);
              });
              if (hitObject) {
                setObjects((current) => current.filter((object) => object.id !== hitObject.id));
                if (selectedObjectId === hitObject.id) setSelectedObjectId(null);
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
            const needed = tool === 'angle' ? 3 : 2;
            const nextPending = [...pendingPointIds, point.id];
            if (tool === 'polygon') { if (!pendingPointIds.includes(point.id)) setPendingPointIds(nextPending); return; }
            if (nextPending.length < needed) { setPendingPointIds(nextPending); return; }
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
    ? 'Local interactive 3D: explicit surfaces, sliders, points, parametric curves, and sampled surface intersections. Implicit solids and symbolic intersection curves remain future work.'
    : tool === 'geometry'
      ? 'Local dynamic geometry: constructions, dragging, coordinates, measurements, and line intersections. Advanced loci and transformation tools remain future work.'
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
