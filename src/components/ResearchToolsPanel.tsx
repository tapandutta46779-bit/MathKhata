import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { MathfieldElement } from 'mathlive';
import {
  angleDegrees,
  circleCircleIntersections,
  dilateCoordinate,
  geometryDistance,
  geometryMidpoint,
  geometryPointLabel,
  lineIntersection,
  lineCircleIntersections,
  parseCircleConstruction,
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

function splitTopLevelComma(source: string): [string, string] | null {
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (character === ',' && depth === 0) return [source.slice(0, index), source.slice(index + 1)];
  }
  return null;
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

function useResponsiveCanvasSize(ref: React.RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState({ width: 900, height: 500 });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const update = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(320, Math.round(bounds.width));
      const height = Math.max(280, Math.round(bounds.height));
      setSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

interface GraphExpression {
  id: number;
  expression: string;
  color: string;
  visible: boolean;
}

interface Graph2DSettings {
  showGrid: boolean;
  showMinorGrid: boolean;
  showAxes: boolean;
  showNumbers: boolean;
  lockViewport: boolean;
  gridMode: 'cartesian' | 'polar';
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xStep: number;
  yStep: number;
  xLabel: string;
  yLabel: string;
}

function Graph2D({ storagePrefix }: { storagePrefix: string }) {
  const [expressions, setExpressions] = usePersistentResearchState<GraphExpression[]>(`${storagePrefix}:2d:expressions`, [
    { id: 1, expression: 'sin(x)', color: GRAPH_COLORS[0], visible: true },
    { id: 2, expression: 'x^2/8-2', color: GRAPH_COLORS[1], visible: true },
  ]);
  const [viewport, setViewport] = usePersistentResearchState(`${storagePrefix}:2d:viewport`, { centerX: 0, centerY: 0, scale: 52 });
  const [settings, setSettings] = usePersistentResearchState<Graph2DSettings>(`${storagePrefix}:2d:settings`, {
    showGrid: true,
    showMinorGrid: true,
    showAxes: true,
    showNumbers: true,
    lockViewport: false,
    gridMode: 'cartesian',
    xMin: -10,
    xMax: 10,
    yMin: -6,
    yMax: 6,
    xStep: 0,
    yStep: 0,
    xLabel: 'x',
    yLabel: 'y',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const [trace, setTrace] = useState<{ x: number; y: number; color: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; centerX: number; centerY: number } | null>(null);
  const evaluatorsRef = useRef<Array<{ color: string; evaluate: (values: Record<string, number>) => number }>>([]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const dismiss = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          setSettingsOpen(false);
        }
        return;
      }
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('pointerdown', dismiss, true);
    return () => {
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('pointerdown', dismiss, true);
    };
  }, [settingsOpen]);

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
        const xStep = settings.xStep > 0 ? settings.xStep : step;
        const yStep = settings.yStep > 0 ? settings.yStep : step;
        const worldLeft = viewport.centerX - width / (2 * viewport.scale);
        const worldRight = viewport.centerX + width / (2 * viewport.scale);
        const worldBottom = viewport.centerY - height / (2 * viewport.scale);
        const worldTop = viewport.centerY + height / (2 * viewport.scale);
        const screenX = (x: number) => width / 2 + (x - viewport.centerX) * viewport.scale;
        const screenY = (y: number) => height / 2 - (y - viewport.centerY) * viewport.scale;

        if (settings.showGrid && settings.gridMode === 'cartesian' && settings.showMinorGrid) {
          const minorX = xStep / 5;
          const minorY = yStep / 5;
          if (minorX * viewport.scale >= 7) {
            context.strokeStyle = '#f0ede6'; context.lineWidth = .65;
            for (let x = Math.ceil(worldLeft / minorX) * minorX; x <= worldRight; x += minorX) {
              if (Math.abs(x / xStep - Math.round(x / xStep)) < 1e-7) continue;
              const px = screenX(x); context.beginPath(); context.moveTo(px, 0); context.lineTo(px, height); context.stroke();
            }
          }
          if (minorY * viewport.scale >= 7) {
            context.strokeStyle = '#f0ede6'; context.lineWidth = .65;
            for (let y = Math.ceil(worldBottom / minorY) * minorY; y <= worldTop; y += minorY) {
              if (Math.abs(y / yStep - Math.round(y / yStep)) < 1e-7) continue;
              const py = screenY(y); context.beginPath(); context.moveTo(0, py); context.lineTo(width, py); context.stroke();
            }
          }
        }
        if (settings.showGrid && settings.gridMode === 'polar') {
          const originX = screenX(0); const originY = screenY(0);
          const maxRadius = Math.hypot(Math.max(Math.abs(worldLeft), Math.abs(worldRight)), Math.max(Math.abs(worldBottom), Math.abs(worldTop)));
          context.strokeStyle = '#e4e0d7'; context.lineWidth = 1;
          for (let radius = xStep; radius <= maxRadius; radius += xStep) { context.beginPath(); context.arc(originX, originY, radius * viewport.scale, 0, Math.PI * 2); context.stroke(); }
          for (let angle = 0; angle < Math.PI; angle += Math.PI / 12) {
            const reach = maxRadius * viewport.scale;
            context.beginPath(); context.moveTo(originX - Math.cos(angle) * reach, originY + Math.sin(angle) * reach); context.lineTo(originX + Math.cos(angle) * reach, originY - Math.sin(angle) * reach); context.stroke();
          }
        }
        context.font = '10px ui-monospace, monospace';
        context.textAlign = 'center';
        context.textBaseline = 'top';
        for (let x = Math.ceil(worldLeft / xStep) * xStep; x <= worldRight; x += xStep) {
          const px = screenX(x); const axis = Math.abs(x) < xStep / 100;
          if (!settings.showGrid && !(settings.showAxes && axis)) continue;
          context.strokeStyle = axis ? '#77736b' : '#d9d5cc';
          context.lineWidth = axis ? 1.6 : 1;
          context.beginPath(); context.moveTo(px, 0); context.lineTo(px, height); context.stroke();
          if (settings.showNumbers && settings.showAxes && !axis) {
            context.fillStyle = '#77736b';
            context.fillText(Number(x.toPrecision(5)).toString(), px, Math.min(height - 14, Math.max(3, screenY(0) + 4)));
          }
        }
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        for (let y = Math.ceil(worldBottom / yStep) * yStep; y <= worldTop; y += yStep) {
          const py = screenY(y); const axis = Math.abs(y) < yStep / 100;
          if (!settings.showGrid && !(settings.showAxes && axis)) continue;
          context.strokeStyle = axis ? '#77736b' : '#d9d5cc';
          context.lineWidth = axis ? 1.6 : 1;
          context.beginPath(); context.moveTo(0, py); context.lineTo(width, py); context.stroke();
          if (settings.showNumbers && settings.showAxes && !axis) {
            context.fillStyle = '#77736b';
            context.fillText(Number(y.toPrecision(5)).toString(), Math.min(width - 35, Math.max(4, screenX(0) + 5)), py);
          }
        }
        if (settings.showAxes) {
          context.fillStyle = '#4f4b44'; context.font = 'bold 11px ui-monospace, monospace';
          context.textAlign = 'right'; context.textBaseline = 'top'; context.fillText(settings.xLabel || 'x', width - 8, Math.max(4, Math.min(height - 16, screenY(0) + 5)));
          context.textAlign = 'left'; context.textBaseline = 'top'; context.fillText(settings.yLabel || 'y', Math.max(5, Math.min(width - 18, screenX(0) + 6)), 6);
        }

        const active = expressions.filter((entry) => entry.visible && entry.expression.trim());
        const parameterValues: Record<string, number> = {};
        active.forEach((entry) => {
          const parameter = entry.expression.trim().match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/);
          if (parameter && !['x', 'y'].includes(parameter[1])) parameterValues[parameter[1]] = Number(parameter[2]);
        });
        type Compiled2D =
          | { kind: 'y'; color: string; evaluate: (values: Record<string, number>) => number }
          | { kind: 'x'; color: string; evaluate: (values: Record<string, number>) => number }
          | { kind: 'implicit'; color: string; evaluate: (values: Record<string, number>) => number }
          | { kind: 'point'; color: string; evaluateX: (values: Record<string, number>) => number; evaluateY: (values: Record<string, number>) => number }
          | { kind: 'parametric'; color: string; evaluateX: (values: Record<string, number>) => number; evaluateY: (values: Record<string, number>) => number };
        const compiled = (await Promise.all(active.map(async (entry): Promise<Compiled2D | null> => {
          const source = entry.expression.trim();
          if (/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/.test(source) && !/^[xy]\s*=/.test(source)) return null;
          const restrictions = (source.match(/\{[^{}]+\}/g) ?? []).join('');
          const base = source.replace(/\{[^{}]+\}/g, '').trim();
          const tuple = base.match(/^\((.*)\)$/);
          const coordinates = tuple ? splitTopLevelComma(tuple[1]) : null;
          if (coordinates) {
            const isParametric = /\bt\b/.test(coordinates[0]) || /\bt\b/.test(coordinates[1]);
            return {
              kind: isParametric ? 'parametric' : 'point',
              color: entry.color,
              evaluateX: await numericEvaluatorWithRestrictions(`${coordinates[0]}${restrictions}`),
              evaluateY: await numericEvaluatorWithRestrictions(`${coordinates[1]}${restrictions}`),
            };
          }
          const yExplicit = base.match(/^y\s*=\s*(.+)$/i);
          if (yExplicit) return { kind: 'y', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(`${yExplicit[1]}${restrictions}`) };
          const xExplicit = base.match(/^x\s*=\s*(.+)$/i);
          if (xExplicit) return { kind: 'x', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(`${xExplicit[1]}${restrictions}`) };
          const equals = base.indexOf('=');
          if (equals > 0) {
            const left = base.slice(0, equals); const right = base.slice(equals + 1);
            return { kind: 'implicit', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(`(${left})-(${right})${restrictions}`) };
          }
          return { kind: 'y', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(`${base}${restrictions}`) };
        }))).filter((entry): entry is Compiled2D => Boolean(entry));
        if (cancelled) return;
        evaluatorsRef.current = compiled.filter((entry): entry is Extract<Compiled2D, { kind: 'y' }> => entry.kind === 'y').map((entry) => ({ color: entry.color, evaluate: (values) => entry.evaluate({ ...parameterValues, ...values }) }));
        for (const entry of compiled) {
          context.strokeStyle = entry.color;
          context.lineWidth = 2.25;
          context.lineJoin = 'round';
          if (entry.kind === 'point') {
            const x = entry.evaluateX(parameterValues); const y = entry.evaluateY(parameterValues);
            if (Number.isFinite(x) && Number.isFinite(y)) {
              context.fillStyle = entry.color; context.strokeStyle = '#fffefa'; context.lineWidth = 2;
              context.beginPath(); context.arc(screenX(x), screenY(y), 6, 0, Math.PI * 2); context.fill(); context.stroke();
            }
            continue;
          }
          if (entry.kind === 'parametric') {
            context.beginPath(); let drawing = false;
            for (let sample = 0; sample <= 500; sample += 1) {
              const t = -10 + sample * 20 / 500;
              const x = entry.evaluateX({ ...parameterValues, t }); const y = entry.evaluateY({ ...parameterValues, t });
              const px = screenX(x); const py = screenY(y);
              if (![px, py].every(Number.isFinite)) { drawing = false; continue; }
              if (!drawing) { context.moveTo(px, py); drawing = true; } else context.lineTo(px, py);
            }
            context.stroke();
            continue;
          }
          if (entry.kind === 'implicit') {
            const columns = Math.max(90, Math.min(220, Math.round(width / 5)));
            const rows = Math.max(60, Math.min(150, Math.round(height / 5)));
            const values: number[][] = [];
            for (let row = 0; row <= rows; row += 1) {
              const y = worldTop - row * (worldTop - worldBottom) / rows;
              const rowValues = [];
              for (let column = 0; column <= columns; column += 1) {
                const x = worldLeft + column * (worldRight - worldLeft) / columns;
                rowValues.push(entry.evaluate({ ...parameterValues, x, y }));
              }
              values.push(rowValues);
            }
            const crossing = (ax: number, ay: number, av: number, bx: number, by: number, bv: number) => {
              if (![av, bv].every(Number.isFinite) || av * bv > 0 || Math.abs(av - bv) < 1e-12) return null;
              const ratio = av / (av - bv);
              return { x: ax + (bx - ax) * ratio, y: ay + (by - ay) * ratio };
            };
            context.beginPath();
            for (let row = 0; row < rows; row += 1) {
              const yTop = worldTop - row * (worldTop - worldBottom) / rows;
              const yBottom = worldTop - (row + 1) * (worldTop - worldBottom) / rows;
              for (let column = 0; column < columns; column += 1) {
                const xLeft = worldLeft + column * (worldRight - worldLeft) / columns;
                const xRight = worldLeft + (column + 1) * (worldRight - worldLeft) / columns;
                const intersections = [
                  crossing(xLeft, yTop, values[row][column], xRight, yTop, values[row][column + 1]),
                  crossing(xRight, yTop, values[row][column + 1], xRight, yBottom, values[row + 1][column + 1]),
                  crossing(xRight, yBottom, values[row + 1][column + 1], xLeft, yBottom, values[row + 1][column]),
                  crossing(xLeft, yBottom, values[row + 1][column], xLeft, yTop, values[row][column]),
                ].filter((point): point is { x: number; y: number } => Boolean(point));
                for (let index = 0; index + 1 < intersections.length; index += 2) {
                  context.moveTo(screenX(intersections[index].x), screenY(intersections[index].y));
                  context.lineTo(screenX(intersections[index + 1].x), screenY(intersections[index + 1].y));
                }
              }
            }
            context.stroke();
            continue;
          }
          context.beginPath();
          let drawing = false;
          let previousY = 0;
          const horizontal = entry.kind === 'y';
          const pixelLimit = horizontal ? width : height;
          for (let pixel = 0; pixel <= pixelLimit; pixel += 2) {
            const independent = horizontal ? worldLeft + pixel / viewport.scale : worldTop - pixel / viewport.scale;
            const dependent = entry.evaluate({ ...parameterValues, [horizontal ? 'x' : 'y']: independent });
            const px = horizontal ? pixel : screenX(dependent);
            const py = horizontal ? screenY(dependent) : pixel;
            const discontinuity = drawing && Math.abs((horizontal ? py : px) - previousY) > (horizontal ? height : width) * .8;
            if (!Number.isFinite(px) || !Number.isFinite(py) || px < -width * 4 || px > width * 5 || py < -height * 4 || py > height * 5 || discontinuity) {
              drawing = false;
            } else if (!drawing) {
              context.moveTo(px, py);
              drawing = true;
            } else context.lineTo(px, py);
            previousY = horizontal ? py : px;
          }
          context.stroke();
        }
        setError('');
      } catch {
        evaluatorsRef.current = [];
        setError('Check each visible line. Try y=sin(x), x=2, (x-2)^2+(y+1)^2=9, (cos(t),sin(t)), or a=2.');
      }
    };
    void draw();
    return () => { cancelled = true; };
  }, [canvasSize.height, canvasSize.width, expressions, settings, viewport]);

  const updateExpression = (id: number, patch: Partial<GraphExpression>) => {
    setExpressions((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  };

  const applyAxisBounds = () => {
    const xRange = settings.xMax - settings.xMin;
    const yRange = settings.yMax - settings.yMin;
    if (!(xRange > 0) || !(yRange > 0)) return;
    setViewport({
      centerX: (settings.xMin + settings.xMax) / 2,
      centerY: (settings.yMin + settings.yMax) / 2,
      scale: Math.max(12, Math.min(300, Math.min(900 / xRange, 500 / yRange))),
    });
  };

  return (
    <section className="research-graph-lab">
      <aside className="graph-expression-list" aria-label="2D graph expressions">
        <header><strong>Expressions</strong><span>{expressions.length}/12</span></header>
        {expressions.map((entry, index) => {
          const parameter = entry.expression.trim().match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/);
          const isParameter = Boolean(parameter && !['x', 'y'].includes(parameter[1]));
          return <div className={`graph-expression${isParameter ? ' graph-expression--parameter' : ''}`} key={entry.id}>
            <button
              type="button"
              className={`graph-color${entry.visible ? ' is-visible' : ''}`}
              style={{ '--graph-color': entry.color } as React.CSSProperties}
              aria-label={`${entry.visible ? 'Hide' : 'Show'} expression ${index + 1}`}
              onClick={() => updateExpression(entry.id, { visible: !entry.visible })}
            />
            <label><span>{index + 1}</span><input aria-label={`Expression ${index + 1}`} placeholder="y=sin(x)" value={entry.expression} onChange={(event) => updateExpression(entry.id, { expression: event.target.value })} /></label>
            {expressions.length > 1 && <button type="button" aria-label={`Remove expression ${index + 1}`} onClick={() => setExpressions((current) => current.filter((item) => item.id !== entry.id))}>×</button>}
            {isParameter && parameter && <label className="graph-inline-slider"><span>{parameter[1]} = {Number(parameter[2]).toFixed(2)}</span><input type="range" aria-label={`Parameter ${parameter[1]} value`} min="-10" max="10" step="0.1" value={Number(parameter[2])} onChange={(event) => updateExpression(entry.id, { expression: `${parameter[1]}=${event.target.value}` })} /></label>}
          </div>
        })}
        <button
          type="button"
          className="graph-add-expression"
          disabled={expressions.length >= 12}
          onClick={() => setExpressions((current) => [...current, {
            id: Math.max(0, ...current.map((entry) => entry.id)) + 1,
            expression: '',
            color: GRAPH_COLORS[current.length % GRAPH_COLORS.length],
            visible: true,
          }])}
        >
          + Add expression
        </button>
        <p>Write complete lines: <b>y=sin(x)</b>, <b>x=2</b>, <b>(x-2)^2+(y+1)^2=9</b>, <b>(cos(t),sin(t))</b>, or <b>a=2</b>.</p>
      </aside>
      <div className="graph-stage">
        <div className="graph-controls" aria-label="2D graph view controls" ref={settingsRef}>
          <div className="graph-settings-anchor">
            <button type="button" aria-label="2D graph settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((current) => !current)}>Settings</button>
            {settingsOpen && <section className="graph-settings-popover" aria-label="2D graph settings panel">
              <header><strong>Graph settings</strong><button type="button" aria-label="Close 2D graph settings" onClick={() => setSettingsOpen(false)}>×</button></header>
              <div className="graph-settings-checks">
                <label><input type="checkbox" checked={settings.showGrid} onChange={(event) => setSettings((current) => ({ ...current, showGrid: event.target.checked }))} /> Grid</label>
                <label><input type="checkbox" checked={settings.showMinorGrid} onChange={(event) => setSettings((current) => ({ ...current, showMinorGrid: event.target.checked }))} /> Minor grid</label>
                <label><input type="checkbox" checked={settings.showAxes} onChange={(event) => setSettings((current) => ({ ...current, showAxes: event.target.checked }))} /> Axes</label>
                <label><input type="checkbox" checked={settings.showNumbers} onChange={(event) => setSettings((current) => ({ ...current, showNumbers: event.target.checked }))} /> Numbers</label>
                <label><input type="checkbox" checked={settings.lockViewport} onChange={(event) => setSettings((current) => ({ ...current, lockViewport: event.target.checked }))} /> Lock viewport</label>
              </div>
              <label>Grid<select aria-label="2D grid type" value={settings.gridMode} onChange={(event) => setSettings((current) => ({ ...current, gridMode: event.target.value as Graph2DSettings['gridMode'] }))}><option value="cartesian">Cartesian</option><option value="polar">Polar</option></select></label>
              <div className="graph-axis-settings"><strong>x axis</strong><label>min<input type="number" value={settings.xMin} onChange={(event) => setSettings((current) => ({ ...current, xMin: Number(event.target.value) }))} /></label><label>max<input type="number" value={settings.xMax} onChange={(event) => setSettings((current) => ({ ...current, xMax: Number(event.target.value) }))} /></label><label>step<input type="number" min="0" step="0.1" value={settings.xStep} onChange={(event) => setSettings((current) => ({ ...current, xStep: Number(event.target.value) }))} /></label><label>label<input value={settings.xLabel} onChange={(event) => setSettings((current) => ({ ...current, xLabel: event.target.value }))} /></label></div>
              <div className="graph-axis-settings"><strong>y axis</strong><label>min<input type="number" value={settings.yMin} onChange={(event) => setSettings((current) => ({ ...current, yMin: Number(event.target.value) }))} /></label><label>max<input type="number" value={settings.yMax} onChange={(event) => setSettings((current) => ({ ...current, yMax: Number(event.target.value) }))} /></label><label>step<input type="number" min="0" step="0.1" value={settings.yStep} onChange={(event) => setSettings((current) => ({ ...current, yStep: Number(event.target.value) }))} /></label><label>label<input value={settings.yLabel} onChange={(event) => setSettings((current) => ({ ...current, yLabel: event.target.value }))} /></label></div>
              <button type="button" className="research-primary" onClick={applyAxisBounds}>Apply bounds</button>
            </section>}
          </div>
          <button type="button" aria-label="Zoom in" disabled={settings.lockViewport} onClick={() => setViewport((view) => ({ ...view, scale: Math.min(300, view.scale * 1.25) }))}>+</button>
          <button type="button" aria-label="Zoom out" disabled={settings.lockViewport} onClick={() => setViewport((view) => ({ ...view, scale: Math.max(12, view.scale / 1.25) }))}>−</button>
          <button type="button" aria-label="Reset graph view" onClick={() => setViewport({ centerX: 0, centerY: 0, scale: 52 })}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          aria-label="Interactive 2D graph"
          onPointerDown={(event) => {
            if (settings.lockViewport) return;
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
            if (settings.lockViewport) return;
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

interface Graph3DBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
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
  const [bounds, setBounds] = usePersistentResearchState<Graph3DBounds>(`${storagePrefix}:3d:bounds`, { xMin: -5, xMax: 5, yMin: -5, yMax: 5, zMin: -5, zMax: 5 });
  const [resolution, setResolution] = usePersistentResearchState(`${storagePrefix}:3d:resolution`, 29);
  const [camera, setCamera] = usePersistentResearchState(`${storagePrefix}:3d:camera`, { yaw: -.72, pitch: -.58, zoom: 1 });
  const [renderMode, setRenderMode] = usePersistentResearchState<SurfaceRenderMode>(`${storagePrefix}:3d:render`, 'solid');
  const [projection, setProjection] = usePersistentResearchState<SurfaceProjection>(`${storagePrefix}:3d:projection`, 'perspective');
  const [showAxes, setShowAxes] = usePersistentResearchState(`${storagePrefix}:3d:axes`, true);
  const [showGrid, setShowGrid] = usePersistentResearchState(`${storagePrefix}:3d:grid`, true);
  const [showNumbers, setShowNumbers] = usePersistentResearchState(`${storagePrefix}:3d:numbers`, true);
  const [showCube, setShowCube] = usePersistentResearchState(`${storagePrefix}:3d:cube`, true);
  const [showSurfaceIntersections, setShowSurfaceIntersections] = usePersistentResearchState(`${storagePrefix}:3d:intersections`, true);
  const [perspectiveStrength, setPerspectiveStrength] = usePersistentResearchState(`${storagePrefix}:3d:perspective-strength`, .65);
  const [lockRotation, setLockRotation] = usePersistentResearchState(`${storagePrefix}:3d:lock-rotation`, false);
  const [lockZoom, setLockZoom] = usePersistentResearchState(`${storagePrefix}:3d:lock-zoom`, false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const [trace, setTrace] = useState<{ x: number; y: number; z: number; color: string; expression: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const tracePointsRef = useRef<Array<{ screenX: number; screenY: number; x: number; y: number; z: number; color: string; expression: string }>>([]);
  const orderedBounds = (minimum: number, maximum: number): [number, number] => minimum === maximum
    ? [minimum - 1, maximum + 1]
    : [Math.min(minimum, maximum), Math.max(minimum, maximum)];
  const [xMin, xMax] = orderedBounds(bounds.xMin, bounds.xMax);
  const [yMin, yMax] = orderedBounds(bounds.yMin, bounds.yMax);
  const [zMin, zMax] = orderedBounds(bounds.zMin, bounds.zMax);
  const xRange = xMax - xMin; const yRange = yMax - yMin; const zRange = zMax - zMin;
  const domain = Math.max(1, xRange / 2, yRange / 2, zRange / 2);
  const viewCenter = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2, z: (zMin + zMax) / 2 };

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const dismiss = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          setSettingsOpen(false);
        }
        return;
      }
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('pointerdown', dismiss, true);
    return () => {
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('pointerdown', dismiss, true);
    };
  }, [settingsOpen]);

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
          const centeredX = x - viewCenter.x; const centeredY = y - viewCenter.y; const centeredZ = z - viewCenter.z;
          const yawX = centeredX * cosYaw - centeredY * sinYaw;
          const yawY = centeredX * sinYaw + centeredY * cosYaw;
          const pitchY = yawY * cosPitch - centeredZ * sinPitch;
          const depth = yawY * sinPitch + centeredZ * cosPitch;
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
        const gridEvery = domain <= 4 ? .5 : domain <= 8 ? 1 : 2;
        if (showGrid) {
          context.save();
          context.setLineDash([]);
          const gridPlaneZ = Math.max(zMin, Math.min(zMax, 0));
          for (let value = Math.ceil(yMin / gridEvery) * gridEvery; value <= yMax + .001; value += gridEvery) {
            const major = Math.abs(value / (gridEvery * 2) - Math.round(value / (gridEvery * 2))) < 1e-7;
            const color = major ? 'rgba(95,91,82,.22)' : 'rgba(95,91,82,.11)';
            drawSpatialLine([xMin, value, gridPlaneZ], [xMax, value, gridPlaneZ], color, major ? 1 : .65);
          }
          for (let value = Math.ceil(xMin / gridEvery) * gridEvery; value <= xMax + .001; value += gridEvery) {
            const major = Math.abs(value / (gridEvery * 2) - Math.round(value / (gridEvery * 2))) < 1e-7;
            const color = major ? 'rgba(95,91,82,.22)' : 'rgba(95,91,82,.11)';
            drawSpatialLine([value, yMin, gridPlaneZ], [value, yMax, gridPlaneZ], color, major ? 1 : .65);
          }
          context.restore();
        }
        if (showCube) {
          const corners: Array<[number, number, number]> = [
            [xMin, yMin, zMin], [xMax, yMin, zMin], [xMax, yMax, zMin], [xMin, yMax, zMin],
            [xMin, yMin, zMax], [xMax, yMin, zMax], [xMax, yMax, zMax], [xMin, yMax, zMax],
          ];
          const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
          edges.forEach(([start, end]) => drawSpatialLine(corners[start], corners[end], 'rgba(77,73,67,.16)', .8));
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
              const y = yMin + row * yRange / (resolution - 1);
              for (let column = 0; column < resolution; column += 1) {
                const x = xMin + column * xRange / (resolution - 1);
                const rawZ = evaluate({ x, y, ...parameterValues });
                const z = Math.max(zMin, Math.min(zMax, rawZ));
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
            const stepX = xRange / (sampleCount - 1);
            const stepY = yRange / (sampleCount - 1);
            const stepZ = zRange / (sampleCount - 1);
            const values: number[][][] = [];
            for (let zIndex = 0; zIndex < sampleCount; zIndex += 1) {
              const z = zMin + zIndex * stepZ;
              const plane: number[][] = [];
              for (let yIndex = 0; yIndex < sampleCount; yIndex += 1) {
                const y = yMin + yIndex * stepY;
                const row = [];
                for (let xIndex = 0; xIndex < sampleCount; xIndex += 1) {
                  const x = xMin + xIndex * stepX;
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
              const z = zMin + zIndex * stepZ;
              for (let yIndex = 0; yIndex < sampleCount; yIndex += 1) {
                const y = yMin + yIndex * stepY;
                for (let xIndex = 0; xIndex < sampleCount; xIndex += 1) {
                  const x = xMin + xIndex * stepX;
                  const first = { x, y, z, value: values[zIndex][yIndex][xIndex] };
                  if (xIndex + 1 < sampleCount) addCrossing(first, { x: x + stepX, y, z, value: values[zIndex][yIndex][xIndex + 1] });
                  if (yIndex + 1 < sampleCount) addCrossing(first, { x, y: y + stepY, z, value: values[zIndex][yIndex + 1][xIndex] });
                  if (zIndex + 1 < sampleCount) addCrossing(first, { x, y, z: z + stepZ, value: values[zIndex + 1][yIndex][xIndex] });
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
          const heightFade = .62 + .38 * Math.max(0, Math.min(1, (cell.height - zMin) / zRange));
          context.globalAlpha = cell.opacity * heightFade;
          if (renderMode === 'contours') {
            const minimum = Math.min(...cell.points.map((point) => point.z));
            const maximum = Math.max(...cell.points.map((point) => point.z));
            const contourStep = Math.max(.25, zRange / 10);
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
          const threshold = Math.max(xRange, yRange, zRange) * .85 / Math.max(1, resolution - 1);
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
          const axisX = Math.max(xMin, Math.min(xMax, 0));
          const axisY = Math.max(yMin, Math.min(yMax, 0));
          const axisZ = Math.max(zMin, Math.min(zMax, 0));
          const axes = [
            { start: [xMin, axisY, axisZ] as [number, number, number], end: [xMax, axisY, axisZ] as [number, number, number], label: 'x', color: '#a45236' },
            { start: [axisX, yMin, axisZ] as [number, number, number], end: [axisX, yMax, axisZ] as [number, number, number], label: 'y', color: '#3777a5' },
            { start: [axisX, axisY, zMin] as [number, number, number], end: [axisX, axisY, zMax] as [number, number, number], label: 'z', color: '#5f8b4c' },
          ];
          context.font = 'bold 12px ui-monospace, monospace';
          axes.forEach((axis) => {
            drawSpatialLine(axis.start, axis.end, axis.color, 1.8);
            const endpoint = project(...axis.end);
            context.fillStyle = axis.color;
            context.fillText(axis.label, endpoint.x + 4, endpoint.y - 4);
          });
          if (showNumbers) {
            const tickEvery = gridEvery * 2;
            context.font = '9px ui-monospace, monospace';
            context.fillStyle = '#77736b';
            const drawTick = (value: number, x: number, y: number, z: number) => {
              if (Math.abs(value) < 1e-8) return;
              const point = project(x, y, z);
              context.beginPath(); context.arc(point.x, point.y, 2, 0, Math.PI * 2); context.fill();
              context.fillText(`${Number(value.toPrecision(4))}`, point.x + 4, point.y - 3);
            };
            for (let value = Math.ceil(xMin / tickEvery) * tickEvery; value <= xMax + .001; value += tickEvery) drawTick(value, value, axisY, axisZ);
            for (let value = Math.ceil(yMin / tickEvery) * tickEvery; value <= yMax + .001; value += tickEvery) drawTick(value, axisX, value, axisZ);
            for (let value = Math.ceil(zMin / tickEvery) * tickEvery; value <= zMax + .001; value += tickEvery) drawTick(value, axisX, axisY, value);
          }
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
  }, [bounds, camera, canvasSize.height, canvasSize.width, curves3D, domain, implicitSurfaces, parameters, parametricSurfaces, perspectiveStrength, points3D, projection, renderMode, resolution, showAxes, showCube, showGrid, showNumbers, showSurfaceIntersections, surfaces]);

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
        <p>Drag to orbit · wheel to zoom · hover to inspect · restrict explicit/implicit expressions with {'{x>-2}{x<2}'}</p>
      </aside>
      <div className="graph-stage">
        <div className="graph-controls" aria-label="3D graph view controls" ref={settingsRef}>
          <div className="graph-settings-anchor">
            <button type="button" aria-label="3D graph settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((current) => !current)}>Settings</button>
            {settingsOpen && <section className="graph-settings-popover graph-settings-popover--3d" aria-label="3D graph settings panel">
              <header><strong>3D graph settings</strong><button type="button" aria-label="Close 3D graph settings" onClick={() => setSettingsOpen(false)}>×</button></header>
              <div className="surface-view-options">
                <label>Rendering<select aria-label="3D rendering style" value={renderMode} onChange={(event) => setRenderMode(event.target.value as SurfaceRenderMode)}><option value="solid">Solid + mesh</option><option value="mesh">Wire mesh</option><option value="contours">Contour mesh</option></select></label>
                <label>Projection<select aria-label="3D projection" value={projection} onChange={(event) => setProjection(event.target.value as SurfaceProjection)}><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
                <label><input type="checkbox" checked={showAxes} onChange={(event) => setShowAxes(event.target.checked)} /> Axes</label>
                <label><input type="checkbox" checked={showNumbers} onChange={(event) => setShowNumbers(event.target.checked)} /> Axis numbers</label>
                <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> XY grid</label>
                <label><input type="checkbox" checked={showCube} onChange={(event) => setShowCube(event.target.checked)} /> Bounding cube</label>
                <label><input type="checkbox" checked={showSurfaceIntersections} onChange={(event) => setShowSurfaceIntersections(event.target.checked)} /> Intersections</label>
                <label><input type="checkbox" checked={lockRotation} onChange={(event) => setLockRotation(event.target.checked)} /> Lock rotation</label>
                <label><input type="checkbox" checked={lockZoom} onChange={(event) => setLockZoom(event.target.checked)} /> Lock zoom</label>
              </div>
              <label className="graph-slider">Perspective {Math.round(perspectiveStrength * 100)}%<input type="range" min="0" max="1" step="0.05" disabled={projection === 'orthographic'} value={perspectiveStrength} onChange={(event) => setPerspectiveStrength(Number(event.target.value))} /></label>
              <section className="graph-3d-bounds" aria-label="3D axis bounds">
                <header><strong>Axis bounds</strong><span>Set each visible dimension independently</span></header>
                <div>
                  <strong>x</strong>
                  <label>min<input aria-label="3D x minimum" type="number" step="1" value={bounds.xMin} onChange={(event) => setBounds((current) => ({ ...current, xMin: Number(event.target.value) }))} /></label>
                  <label>max<input aria-label="3D x maximum" type="number" step="1" value={bounds.xMax} onChange={(event) => setBounds((current) => ({ ...current, xMax: Number(event.target.value) }))} /></label>
                </div>
                <div>
                  <strong>y</strong>
                  <label>min<input aria-label="3D y minimum" type="number" step="1" value={bounds.yMin} onChange={(event) => setBounds((current) => ({ ...current, yMin: Number(event.target.value) }))} /></label>
                  <label>max<input aria-label="3D y maximum" type="number" step="1" value={bounds.yMax} onChange={(event) => setBounds((current) => ({ ...current, yMax: Number(event.target.value) }))} /></label>
                </div>
                <div>
                  <strong>z</strong>
                  <label>min<input aria-label="3D z minimum" type="number" step="1" value={bounds.zMin} onChange={(event) => setBounds((current) => ({ ...current, zMin: Number(event.target.value) }))} /></label>
                  <label>max<input aria-label="3D z maximum" type="number" step="1" value={bounds.zMax} onChange={(event) => setBounds((current) => ({ ...current, zMax: Number(event.target.value) }))} /></label>
                </div>
                <div className="graph-3d-bound-actions">
                  <button type="button" onClick={() => setBounds({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, zMin: -5, zMax: 5 })}>Reset bounds</button>
                  <button type="button" onClick={() => setBounds({ xMin: -domain, xMax: domain, yMin: -domain, yMax: domain, zMin: -domain, zMax: domain })}>Equalize ±{Number(domain.toPrecision(3))}</button>
                </div>
              </section>
              <label className="graph-slider">Mesh {resolution}×{resolution}<input type="range" min="17" max="45" step="2" value={resolution} onChange={(event) => setResolution(Number(event.target.value))} /></label>
              <div className="surface-presets" aria-label="3D camera presets"><button type="button" onClick={() => setCameraPreset('iso')}>Perspective</button><button type="button" onClick={() => setCameraPreset('top')}>Top</button><button type="button" onClick={() => setCameraPreset('front')}>Front</button><button type="button" onClick={() => setCameraPreset('side')}>Side</button></div>
            </section>}
          </div>
          <button type="button" aria-label="Zoom 3D view in" disabled={lockZoom} onClick={() => setCamera((view) => ({ ...view, zoom: Math.min(2.6, view.zoom * 1.2) }))}>+</button>
          <button type="button" aria-label="Zoom 3D view out" disabled={lockZoom} onClick={() => setCamera((view) => ({ ...view, zoom: Math.max(.45, view.zoom / 1.2) }))}>−</button>
          <button type="button" aria-label="Reset 3D view" onClick={() => setCameraPreset('iso')}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
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
                yaw: drag.yaw - (event.clientX - drag.x) * .004,
                pitch: Math.max(-1.52, Math.min(1.52, drag.pitch + (event.clientY - drag.y) * .004)),
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
          onPointerUp={(event) => {
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { dragRef.current = null; }}
          onLostPointerCapture={() => { dragRef.current = null; }}
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
  | { type: 'radius-edge'; center: number; radius: number; angle: number }
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
  const [showMinorGrid, setShowMinorGrid] = usePersistentResearchState(`${storagePrefix}:geometry:minor-grid`, true);
  const [showAxes, setShowAxes] = usePersistentResearchState(`${storagePrefix}:geometry:axes`, true);
  const [lockViewport, setLockViewport] = usePersistentResearchState(`${storagePrefix}:geometry:lock-viewport`, false);
  const [angleUnit, setAngleUnit] = usePersistentResearchState<'degrees' | 'radians'>(`${storagePrefix}:geometry:angle-unit`, 'degrees');
  const [selectedObjectIds, setSelectedObjectIds] = useState<number[]>([]);
  const [constructionCommand, setConstructionCommand] = useState('');
  const [commandError, setCommandError] = useState('');
  const [transform, setTransform] = useState({ dx: 2, dy: 1, angle: 90, scale: 2 });
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const constructionInputRef = useRef<HTMLInputElement | null>(null);
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
          } else if (constraint.type === 'radius-edge') {
            const center = byId.get(constraint.center);
            if (center) coordinate = {
              x: center.x + Math.cos(constraint.angle) * constraint.radius,
              y: center.y + Math.sin(constraint.angle) * constraint.radius,
            };
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
    if (showGrid && showMinorGrid) {
      const minor = step / 5;
      if (minor * viewport.scale >= 7) {
        context.strokeStyle = '#f0ede6'; context.lineWidth = .65;
        for (let x = Math.ceil(worldLeft / minor) * minor; x <= worldRight; x += minor) {
          if (Math.abs(x / step - Math.round(x / step)) < 1e-7) continue;
          const px = screenX(x); context.beginPath(); context.moveTo(px, 0); context.lineTo(px, canvas.height); context.stroke();
        }
        for (let y = Math.ceil(worldBottom / minor) * minor; y <= worldTop; y += minor) {
          if (Math.abs(y / step - Math.round(y / step)) < 1e-7) continue;
          const py = screenY(y); context.beginPath(); context.moveTo(0, py); context.lineTo(canvas.width, py); context.stroke();
        }
      }
    }
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
  }, [angleUnit, canvasSize.height, canvasSize.width, hoverPoint, objects, pendingPointIds, points, selectedObjectIds, showAxes, showGrid, showIntersections, showMeasurements, showMinorGrid, viewport]);

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

  const objectExpression = (object: GeometryObject) => {
    const labels = object.points.map((id) => pointById(id)?.label ?? '?');
    if (object.type === 'circle') {
      const center = pointById(object.points[0]); const edge = pointById(object.points[1]);
      return `circle(${labels[0]}, ${center && edge ? geometryDistance(center, edge).toFixed(3) : labels[1]})`;
    }
    return `${object.type}(${labels.join(', ')})`;
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
              : constraint.type === 'radius-edge'
                ? [constraint.center]
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
    const circle = parseCircleConstruction(command);
    if (circle) {
      if (circle.kind === 'center-edge') {
        const center = pointForLabel(circle.centerLabel); const edge = pointForLabel(circle.edgeLabel);
        if (!center || !edge) { setCommandError('The circle center or radius point does not exist yet.'); return; }
        setObjects((current) => [...current, { id: nextObjectIdRef.current++, type: 'circle', points: [center.id, edge.id] }]);
        setCommandError(''); setConstructionCommand(''); return;
      }
      const center = circle.kind === 'coordinates-radius' ? addPointAt(circle.center) : pointForLabel(circle.centerLabel);
      if (!center) { setCommandError(`Point ${circle.kind === 'center-radius' ? circle.centerLabel : ''} does not exist yet.`); return; }
      const radius = circle.radius;
      const edge = addPointAt({ x: center.x + radius, y: center.y }, { type: 'radius-edge', center: center.id, radius, angle: 0 });
      setObjects((current) => [...current, { id: nextObjectIdRef.current++, type: 'circle', points: [center.id, edge.id] }]);
      setCommandError(''); setConstructionCommand(''); return;
    }
    const match = command.match(/^([a-z]+)\s*\((.*)\)$/i);
    if (!match) { setCommandError('Write point(2,3), segment(A,B), circle(A,3), circle((2,1),3), (x-2)^2+(y-1)^2=9, or polygon(A,B,C).'); return; }
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
    const validType = ['segment', 'vector', 'line', 'ray', 'polygon', 'angle'].includes(operation);
    const validCount = operation === 'polygon' ? ids.length >= 3 : operation === 'angle' ? ids.length === 3 : ids.length === 2;
    if (!validType || !validCount) { setCommandError('That construction or number of point labels is not supported.'); return; }
    setObjects((current) => [...current, { id: nextObjectIdRef.current++, type: operation, points: ids } as GeometryObject]);
    setCommandError(''); setConstructionCommand('');
  };

  const insertGeometryToken = (token: string) => {
    const input = constructionInputRef.current;
    const start = input?.selectionStart ?? constructionCommand.length;
    const end = input?.selectionEnd ?? start;
    const next = `${constructionCommand.slice(0, start)}${token}${constructionCommand.slice(end)}`;
    setConstructionCommand(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const selectedCircle = objects.find((object): object is Extract<GeometryObject, { type: 'circle' }> => object.type === 'circle' && selectedObjectIds.includes(object.id));
  const selectedCircleCenter = selectedCircle ? pointById(selectedCircle.points[0]) : undefined;
  const selectedCircleEdge = selectedCircle ? pointById(selectedCircle.points[1]) : undefined;
  const selectedCircleRadius = selectedCircleCenter && selectedCircleEdge ? geometryDistance(selectedCircleCenter, selectedCircleEdge) : 0;
  const radiusComesFromCompass = selectedCircleEdge?.constraint?.type === 'compass-edge';
  const updateSelectedCircleRadius = (radius: number) => {
    if (!selectedCircleCenter || !selectedCircleEdge || !(radius > 0) || radiusComesFromCompass) return;
    const currentRadius = geometryDistance(selectedCircleCenter, selectedCircleEdge);
    const angle = currentRadius > 1e-9 ? Math.atan2(selectedCircleEdge.y - selectedCircleCenter.y, selectedCircleEdge.x - selectedCircleCenter.x) : 0;
    setPoints((current) => current.map((point) => point.id === selectedCircleEdge.id ? {
      ...point,
      x: selectedCircleCenter.x + Math.cos(angle) * radius,
      y: selectedCircleCenter.y + Math.sin(angle) * radius,
      constraint: point.constraint?.type === 'radius-edge' ? { ...point.constraint, radius, angle } : point.constraint,
    } : point));
  };

  return (
    <section className="geometry-lab">
      <aside className="geometry-sidebar" aria-label="Geometry expression rail">
        <header><strong>Expressions</strong><span>{points.length} points · {objects.length} objects</span></header>
        <div className="geometry-token-navigator" aria-label="Geometry token navigator">
          <span>Insert point</span>
          <div>{points.map((point) => <button type="button" key={point.id} onClick={() => insertGeometryToken(point.label)}>{point.label}</button>)}</div>
        </div>
        <div className="geometry-command">
          <label>New expression<input ref={constructionInputRef} aria-label="Geometry construction expression" placeholder="circle(A,3)" value={constructionCommand} onChange={(event) => setConstructionCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') executeConstructionCommand(); }} /></label>
          <button type="button" onClick={executeConstructionCommand}>Add</button>
          {commandError && <p>{commandError}</p>}
        </div>
        <p className="geometry-expression-help">Try <b>point(2,1)</b>, <b>circle(A,3)</b>, <b>circle((2,1),3)</b>, or <b>(x-2)^2+(y-1)^2=9</b>.</p>
        {tool === 'polygon' && pendingPointIds.length > 0 && <button type="button" className="geometry-finish" disabled={pendingPointIds.length < 3} onClick={finishPolygon}>Finish polygon ({pendingPointIds.length})</button>}
        {pendingPointIds.length > 0 && <p className="geometry-instruction">Selected {pendingPointIds.map((id) => pointById(id)?.label).join(' → ')}. Choose the next point.</p>}
        <div className="geometry-object-list" aria-label="Geometry objects">
          <strong>Construction lines</strong>
          {!objects.length && <p>Choose a tool, then construct directly on the coordinate plane.</p>}
          {objects.map((object, index) => <div className={`geometry-expression-row${selectedObjectIds.includes(object.id) ? ' is-selected' : ''}`} key={object.id}>
            <button type="button" className={`graph-color${object.visible === false ? '' : ' is-visible'}`} style={{ '--graph-color': object.color ?? GRAPH_COLORS[index % GRAPH_COLORS.length] } as React.CSSProperties} aria-label={`${object.visible === false ? 'Show' : 'Hide'} geometry object ${index + 1}`} onClick={() => setObjects((current) => current.map((entry) => entry.id === object.id ? { ...entry, visible: entry.visible === false } : entry))} />
            <button type="button" className="geometry-expression-select" aria-pressed={selectedObjectIds.includes(object.id)} onClick={(event) => setSelectedObjectIds((current) => event.shiftKey ? (current.includes(object.id) ? current.filter((id) => id !== object.id) : [...current, object.id]) : [object.id])}><b>{index + 1}</b><span>{objectExpression(object)}</span><small>{objectDescription(object)}</small></button>
            <button type="button" aria-label={`Delete geometry object ${index + 1}`} onClick={() => { setObjects((current) => current.filter((entry) => entry.id !== object.id)); setSelectedObjectIds((current) => current.filter((id) => id !== object.id)); }}>×</button>
          </div>)}
        </div>
        {selectedObjectIds.length > 0 && <section className="geometry-selection-panel" aria-label="Selected geometry controls">
          <header><strong>{selectedObjectIds.length} selected</strong><button type="button" onClick={() => setSelectedObjectIds([])}>Clear</button></header>
          <div className="geometry-selection-style">
            <label>Color <input type="color" aria-label="Selected geometry color" value={objects.find((object) => selectedObjectIds.includes(object.id))?.color ?? '#9a482c'} onChange={(event) => setObjects((current) => current.map((object) => selectedObjectIds.includes(object.id) ? { ...object, color: event.target.value } : object))} /></label>
            <button type="button" onClick={() => setObjects((current) => current.map((object) => selectedObjectIds.includes(object.id) ? { ...object, visible: object.visible === false } : object))}>{objects.filter((object) => selectedObjectIds.includes(object.id)).every((object) => object.visible === false) ? 'Show' : 'Hide'}</button>
          </div>
          {selectedCircle && selectedCircleCenter && selectedCircleEdge && <div className="geometry-circle-editor" aria-label="Selected circle radius controls">
            <strong>Circle center and radius</strong>
            <div><label>center x<input type="number" step="0.25" aria-label="Selected circle center x" disabled={Boolean(selectedCircleCenter.constraint)} value={Number(selectedCircleCenter.x.toFixed(4))} onChange={(event) => setPoints((current) => current.map((point) => point.id === selectedCircleCenter.id ? { ...point, x: Number(event.target.value) } : point))} /></label><label>center y<input type="number" step="0.25" aria-label="Selected circle center y" disabled={Boolean(selectedCircleCenter.constraint)} value={Number(selectedCircleCenter.y.toFixed(4))} onChange={(event) => setPoints((current) => current.map((point) => point.id === selectedCircleCenter.id ? { ...point, y: Number(event.target.value) } : point))} /></label></div>
            <label>radius<input type="number" min="0.001" step="0.1" aria-label="Selected circle radius" disabled={radiusComesFromCompass} value={Number(selectedCircleRadius.toFixed(4))} onChange={(event) => updateSelectedCircleRadius(Number(event.target.value))} /></label>
            <input type="range" min="0.1" max={Math.max(10, selectedCircleRadius * 2)} step="0.1" aria-label="Selected circle radius slider" disabled={radiusComesFromCompass} value={selectedCircleRadius} onChange={(event) => updateSelectedCircleRadius(Number(event.target.value))} />
            {radiusComesFromCompass && <small>This radius follows the source segment. Edit that segment to preserve the compass constraint.</small>}
          </div>}
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
        <details className="geometry-settings-panel">
          <summary>Graph paper settings</summary>
          <div className="geometry-options">
            <label><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} /> Snap to grid</label>
            <label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Grid</label>
            <label><input type="checkbox" checked={showMinorGrid} onChange={(event) => setShowMinorGrid(event.target.checked)} /> Minor grid</label>
            <label><input type="checkbox" checked={showAxes} onChange={(event) => setShowAxes(event.target.checked)} /> Axes & numbers</label>
            <label><input type="checkbox" checked={showMeasurements} onChange={(event) => setShowMeasurements(event.target.checked)} /> Measurements</label>
            <label><input type="checkbox" checked={showIntersections} onChange={(event) => setShowIntersections(event.target.checked)} /> Intersections</label>
            <label><input type="checkbox" checked={lockViewport} onChange={(event) => setLockViewport(event.target.checked)} /> Lock viewport</label>
            <label>Angles <select aria-label="Geometry angle unit" value={angleUnit} onChange={(event) => setAngleUnit(event.target.value as 'degrees' | 'radians')}><option value="degrees">Degrees</option><option value="radians">Radians</option></select></label>
          </div>
        </details>
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
        <div className="geometry-tool-grid geometry-tool-grid--canvas" role="toolbar" aria-label="Geometry tools">
          {GEOMETRY_TOOLS.map((entry) => <button type="button" key={entry.id} className={tool === entry.id ? 'is-active' : ''} aria-label={entry.label} aria-pressed={tool === entry.id} onClick={() => { setTool(entry.id); setPendingPointIds([]); }}><span>{entry.symbol}</span><span>{entry.label.replace(/ and .*/, '').replace(/Construct /, '').replace(/Add /, '')}</span></button>)}
        </div>
        <div className="graph-controls" aria-label="Geometry view controls">
          <button type="button" aria-label="Zoom geometry in" disabled={lockViewport} onClick={() => setViewport((view) => ({ ...view, scale: Math.min(180, view.scale * 1.25) }))}>+</button>
          <button type="button" aria-label="Zoom geometry out" disabled={lockViewport} onClick={() => setViewport((view) => ({ ...view, scale: Math.max(16, view.scale / 1.25) }))}>−</button>
          <button type="button" aria-label="Reset geometry view" onClick={() => setViewport({ centerX: 0, centerY: 0, scale: 42 })}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
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
              if (hit?.constraint && hit.constraint.type !== 'radius-edge') return;
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
              setPoints((current) => {
                const dragged = current.find((point) => point.id === pointId);
                const constraint = dragged?.constraint;
                if (constraint?.type === 'radius-edge') {
                  const center = current.find((point) => point.id === constraint.center);
                  if (!center) return current;
                  const radius = geometryDistance(center, next);
                  const angle = Math.atan2(next.y - center.y, next.x - center.x);
                  return current.map((point) => point.id === pointId ? { ...point, ...next, constraint: { ...constraint, radius, angle } } : point);
                }
                return current.map((point) => point.id === pointId ? { ...point, ...next } : point);
              });
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

interface ScientificHistoryEntry {
  id: number;
  expressionLatex: string;
  resultLatex: string;
  exact: string;
  decimal: string;
}

function ScientificMath({ latex, label }: { latex: string; label: string }) {
  return <math-field class="scientific-rendered-math" read-only="true" aria-label={label} ref={(element) => {
    if (element && (element as MathfieldElement).value !== latex) (element as MathfieldElement).value = latex;
  }} />;
}

function ScientificLab({ storagePrefix }: { storagePrefix: string }) {
  const [expression, setExpression] = usePersistentResearchState(`${storagePrefix}:scientific:expression`, '\\sin\\left(\\frac{\\pi}{4}\\right)^2+\\cos\\left(\\frac{\\pi}{4}\\right)^2');
  const [history, setHistory] = usePersistentResearchState<ScientificHistoryEntry[]>(`${storagePrefix}:scientific:history`, []);
  const [angleUnit, setAngleUnit] = usePersistentResearchState<'radians' | 'degrees'>(`${storagePrefix}:scientific:angle-unit`, 'radians');
  const [keypad, setKeypad] = usePersistentResearchState<'main' | 'letters' | 'functions'>(`${storagePrefix}:scientific:keypad`, 'main');
  const [error, setError] = useState('');
  const fieldRef = useRef<MathfieldElement | null>(null);
  const previousAnswer = history.at(-1)?.exact ?? '0';

  async function calculate() {
    if (!expression.trim()) return;
    try {
      const { default: nerdamer } = await import('nerdamer-prime');
      nerdamer.set('SILENCE_WARNINGS', true);
      const previousAnswerLatex = nerdamer(previousAnswer).toTeX();
      const expressionWithAnswer = expression.replace(/\\(?:operatorname|mathrm)\{ans\}|\bans\b/gi, `\\left(${previousAnswerLatex}\\right)`);
      let casExpression = String(nerdamer.convertFromLaTeX(expressionWithAnswer)).replace(/\bans\b/gi, `(${previousAnswer})`);
      if (angleUnit === 'degrees') {
        casExpression = casExpression.replace(/\b(sin|cos|tan)\(([^()]*)\)/g, '$1(($2)*pi/180)');
      }
      const evaluated = nerdamer(casExpression).evaluate();
      const exact = evaluated.toString();
      const decimal = evaluated.text('decimals');
      const resultLatex = nerdamer(exact).toTeX();
      setHistory((current) => [...current.slice(-29), {
        id: Math.max(0, ...current.map((entry) => entry.id)) + 1,
        expressionLatex: expression,
        resultLatex,
        exact,
        decimal,
      }]);
      setExpression('');
      if (fieldRef.current) fieldRef.current.value = '';
      setError('');
    } catch {
      setError('Check the expression, function arguments, and parentheses. The previous calculations are unchanged.');
    }
  }

  const insert = (value: string) => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.insert(value, { insertionMode: 'replaceSelection', selectionMode: 'placeholder' });
    setExpression(field.value);
  };

  const mainKeys: Array<[string, string]> = [
    ['a²', '#0^2'], ['aᵇ', '#0^{#?}'], ['|a|', '\\left|#0\\right|'], ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '\\div'], ['%', '\\%'],
    ['a⁄b', '\\frac{#0}{#?}'], ['√', '\\sqrt{#0}'], ['ⁿ√', '\\sqrt[#0]{#?}'], ['π', '\\pi'], ['4', '4'], ['5', '5'], ['6', '6'], ['×', '\\times'],
    ['sin', '\\sin\\left(#0\\right)'], ['cos', '\\cos\\left(#0\\right)'], ['tan', '\\tan\\left(#0\\right)'], ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-'], ['(', '('],
    [')', ')'], [',', ','], ['0', '0'], ['.', '.'], ['ans', '\\operatorname{ans}'], ['+', '+'], ['e', 'e'], ['!', '!'],
  ];
  const functionKeys: Array<[string, string]> = [
    ['asin', '\\arcsin\\left(#0\\right)'], ['acos', '\\arccos\\left(#0\\right)'], ['atan', '\\arctan\\left(#0\\right)'], ['ln', '\\ln\\left(#0\\right)'],
    ['log', '\\log\\left(#0\\right)'], ['logₐ', '\\log_{#0}\\left(#?\\right)'], ['exp', '\\exp\\left(#0\\right)'], ['abs', '\\left|#0\\right|'],
    ['floor', '\\lfloor#0\\rfloor'], ['ceil', '\\lceil#0\\rceil'], ['min', '\\min\\left(#0,#?\\right)'], ['max', '\\max\\left(#0,#?\\right)'],
    ['nCr', '\\operatorname{comb}\\left(#0,#?\\right)'], ['nPr', '\\operatorname{permut}\\left(#0,#?\\right)'], ['mean', '\\operatorname{mean}\\left(#0\\right)'], ['stdev', '\\operatorname{stdev}\\left(#0\\right)'],
  ];
  const letterKeys: Array<[string, string]> = 'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => [letter, letter]);
  const activeKeys = keypad === 'main' ? mainKeys : keypad === 'functions' ? functionKeys : letterKeys;

  return (
    <section className="scientific-workspace">
      <div className="scientific-calculator" aria-label="Scientific calculation workspace">
        <div className="scientific-history" aria-label="Scientific calculation history">
          {!history.length && <p>Enter a calculation below. Each result remains available as <b>ans</b>.</p>}
          {history.map((entry, index) => <article key={entry.id} className="scientific-history-row">
            <span>{index + 1}</span>
            <div><ScientificMath latex={entry.expressionLatex} label={`Scientific expression ${index + 1}`} /><ScientificMath latex={entry.resultLatex} label={`Scientific result ${index + 1}`} /><small>≈ {entry.decimal}</small></div>
            <button type="button" aria-label={`Reuse scientific expression ${index + 1}`} onClick={() => { setExpression(entry.expressionLatex); if (fieldRef.current) { fieldRef.current.value = entry.expressionLatex; fieldRef.current.focus(); } }}>↺</button>
          </article>)}
        </div>
        <math-field
          class="scientific-input"
          aria-label="Scientific expression"
          ref={(element) => {
            fieldRef.current = element;
            if (element && element.value !== expression) element.value = expression;
            if (element) element.mathVirtualKeyboardPolicy = 'manual';
          }}
          onInput={(event) => setExpression((event.currentTarget as MathfieldElement).value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void calculate(); } }}
        />
        <div className="scientific-control-bar">
          <div role="tablist" aria-label="Scientific keypad sections">{(['main', 'letters', 'functions'] as const).map((tab) => <button type="button" role="tab" aria-selected={keypad === tab} key={tab} onClick={() => setKeypad(tab)}>{tab === 'letters' ? 'A B C' : tab}</button>)}</div>
          <div role="radiogroup" aria-label="Scientific angle unit"><button type="button" role="radio" aria-checked={angleUnit === 'radians'} onClick={() => setAngleUnit('radians')}>RAD</button><button type="button" role="radio" aria-checked={angleUnit === 'degrees'} onClick={() => setAngleUnit('degrees')}>DEG</button></div>
          <button type="button" disabled={!history.length} onClick={() => setHistory([])}>Clear history</button>
        </div>
        <div className={`scientific-keypad scientific-keypad--${keypad}`}>
          {activeKeys.map(([label, value]) => <button type="button" key={`${label}-${value}`} onClick={() => insert(value)}>{label}</button>)}
          <button type="button" aria-label="Scientific cursor left" onClick={() => fieldRef.current?.executeCommand('moveToPreviousChar')}>←</button>
          <button type="button" aria-label="Scientific cursor right" onClick={() => fieldRef.current?.executeCommand('moveToNextChar')}>→</button>
          <button type="button" aria-label="Scientific backspace" onClick={() => { fieldRef.current?.executeCommand('deleteBackward'); if (fieldRef.current) setExpression(fieldRef.current.value); }}>⌫</button>
          <button type="button" className="scientific-enter" onClick={() => void calculate()}>Enter ↵</button>
        </div>
        {error && <p className="research-tool-error">{error}</p>}
      </div>
    </section>
  );
}

export function ResearchToolsPanel({ initialTool = '2d', onClose, open = true, notebookId = 'default' }: { initialTool?: ResearchTool; onClose: () => void; open?: boolean; notebookId?: string }) {
  const storagePrefix = `mathkhata:research:${notebookId}`;
  const [tool, setTool] = usePersistentResearchState<ResearchTool>(`${storagePrefix}:tool`, initialTool);
  useEffect(() => {
    if (!open) return undefined;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('.graph-settings-popover')) return;
        event.preventDefault(); event.stopPropagation(); onClose();
      }
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
        {tool === 'scientific' && <ScientificLab storagePrefix={storagePrefix} />}
      </div>
      <footer>{footer}</footer>
    </aside>
  );
}
