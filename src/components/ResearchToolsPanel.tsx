import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { MathfieldElement } from 'mathlive';
import type { ResearchToolKind, ResearchValue } from '../domain/model';
import { useNotebookStore } from '../store/notebookStore';
import {
  focusMathfieldElement,
  dismissActiveMathfieldMenu,
  dismissMathfieldMenuFromOutsidePointer,
  focusActiveMathfield,
  getMathfieldValue,
  insertIntoMathfield,
  registerMathfield,
  setActiveMathfield,
  showActiveMathfieldMenu,
} from '../editor/mathfieldRegistry';
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
import {
  createNumericEvaluator,
  evaluateResearchLatex,
  separateGraphRestrictions,
  simpsonIntegral,
} from '../research/expressionEvaluator';
import {
  createGeometry3DWireframe,
  geometry3DPrimitiveMeasurement,
  orbitGeometry3DCamera,
  type Geometry3DPrimitive,
} from '../research/geometry3dPrimitives';
import { downloadResearchPdf, type ResearchPdfSection } from '../research/researchPdf';
import { splitSignedAreaSegment } from '../research/signedArea';

export type ResearchTool = ResearchToolKind;

const TABS: Array<{ id: ResearchTool; label: string }> = [
  { id: '2d', label: '2D Graph' },
  { id: 'loglog', label: 'Log-Log Graph' },
  { id: '3d', label: '3D Surface' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'geometry3d', label: '3D Geometry' },
  { id: 'scientific', label: 'Scientific' },
];

const RESEARCH_GUIDES: Record<ResearchTool, { title: string; sections: Array<{ heading: string; items: string[] }> }> = {
  '2d': {
    title: '2D Graph guide',
    sections: [
      { heading: 'Plot', items: ['Functions: y=sin(x), y=x^2+1, or just sin(x)', 'Vertical lines: x=2', 'Implicit relations: (x-2)^2+(y+1)^2=9', 'Points and parametric curves: (1,3) or (cos(t),sin(t))', 'One-letter sliders: a=2, then y=a sin(x)', 'Restrictions: y=x^2 {x>0}'] },
      { heading: 'Calculate', items: ['Insert a definite integral, derivative, finite sum/product, or determinant as its own expression line for a checked result.', 'Measure from graph selects a plotted y-function, shades a definite integral, or draws the numerical tangent at x.', 'An unsupported calculation never disables other valid graph lines.'] },
      { heading: 'Navigate', items: ['Drag blank graph paper to pan.', 'Wheel or +/− zooms around the pointer.', 'Move over a curve to inspect x and y; Settings controls axes, grid, labels, and bounds.'] },
    ],
  },
  loglog: {
    title: 'Log-Log Graph guide',
    sections: [
      { heading: 'Plot positive data', items: ['Enter y=x^a, y=3x^2, or another positive-valued function.', 'Both axes use base-10 logarithmic scales; zero and negative coordinates cannot appear.', 'Use parameters such as a=2 on separate lines.'] },
      { heading: 'Read and measure', items: ['Hover a curve or supported crossing to inspect the original x and y coordinates.', 'Click a crossing to keep a marker; remove saved markers from the expression rail.', 'Straight-line slope on a log-log graph is the power-law exponent.'] },
      { heading: 'Navigate', items: ['Drag to pan by decades; wheel or +/− zooms around the pointer.', 'Reset returns to a useful positive range.', 'Download PDF exports the graph with its equations, markers, and viewport details.'] },
    ],
  },
  '3d': {
    title: '3D Surface guide',
    sections: [
      { heading: 'Plot', items: ['Explicit surface: add a surface, then enter sin(x) cos(y) or e^(a x).', 'Implicit surface: add F(x,y,z)=0, then enter x^2+y^2+z^2-9.', 'Add points, parametric curves, parametric surfaces, and sliders from the expression rail.', 'Use one-letter multiplication explicitly when helpful: a x or a*x.'] },
      { heading: 'Calculate', items: ['Measure integral evaluates a double or triple numerical integral over rectangular bounds.', 'For a surface z=f(x,y), a double integral gives signed volume over the chosen x-y rectangle.', 'Expression-line calculus results remain independent from rendering errors.'] },
      { heading: 'Navigate', items: ['Drag to orbit; Shift-drag pans; wheel or +/− zooms.', 'Settings includes axes, cube, projection, mesh resolution, bounds, and camera presets.', 'Hover samples to inspect x, y, and z.'] },
    ],
  },
  geometry: {
    title: '2D Geometry guide',
    sections: [
      { heading: 'Construct', items: ['Choose Move, Point, Segment, Line, Ray, Vector, Circle, Polygon, Perpendicular, or Delete.', 'The command field accepts circle((0,0),3) and other supported construction commands.', 'Drag free points and radius handles; constrained points clearly remain constrained.'] },
      { heading: 'Measure and transform', items: ['Toggle measurements and intersections in Settings.', 'Select objects to style, label, translate, rotate, reflect, or dilate where available.', 'Escape returns to Move so reopening Geometry is non-destructive.'] },
      { heading: 'Navigate', items: ['Move mode drags blank space to pan.', 'Wheel/pinch or +/− performs pointer-anchored continuous zoom.', 'Fit objects and Reset view do not delete constructions.'] },
    ],
  },
  geometry3d: {
    title: '3D Geometry guide',
    sections: [
      { heading: 'Construct', items: ['Use the object gallery for cube, cuboid, tetrahedron, octahedron, sphere, ellipsoid, cylinder, cone, and paraboloid.', 'Commands: point(x,y,z), segment(A,B), vector(A,B), triangle(A,B,C), midpoint(A,B), cube(A,s), cuboid(A,w,d,h), sphere(A,r), ellipsoid(A,rx,ry,rz), cylinder(A,r,h), cone(A,r,h), and paraboloid(A,r,h).', 'Create points first when using named-center commands. Quick object buttons create a movable center automatically.'] },
      { heading: 'Measure and transform', items: ['Distance, vector magnitude, triangle angles, and triangle area are shown for supported selections.', 'Translate, rotate, reflect, and dilate-copy use explicit numeric parameters.', 'Move a selected point on screen or constrain dragging to the x, y, or z axis.'] },
      { heading: 'Navigate', items: ['Drag blank space to orbit; Shift-drag pans; wheel or +/− zooms.', 'Perspective, Top, Front, and Side camera presets are available.', 'Reset view preserves constructions; Reset data clears this section with Restore/Undo.'] },
    ],
  },
  scientific: {
    title: 'Scientific guide',
    sections: [
      { heading: 'Enter mathematics', items: ['Use the Math keyboard, Insert structures, Symbols, or the scientific keypad.', 'Fractions, roots, powers, trigonometry, logarithms, constants, matrices, and ans are structured MathLive notation.', 'Choose radians or degrees before evaluating trigonometric expressions.'] },
      { heading: 'Results', items: ['Calculate returns exact and decimal local CAS results where supported.', 'History is stored in the notebook and ans uses the previous exact result.', 'Unsupported or incomplete input is reported without inventing a value.'] },
    ],
  },
};

function ResearchGuide({ tool }: { tool: ResearchTool }) {
  const guide = RESEARCH_GUIDES[tool];
  return <section className="research-guide" aria-label={`${guide.title} complete supported features`}>
    <header><div><strong>{guide.title}</strong><span>Complete guide to currently supported features</span></div><kbd>Esc</kbd></header>
    <div>{guide.sections.map((section) => <article key={section.heading}><h3>{section.heading}</h3><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div>
    <p>Start with <b>+ Add expression/object</b>. New and reset research sections intentionally contain no sample equations.</p>
  </section>;
}

async function numericEvaluator(expression: string, allowedSymbols: readonly string[] = []) {
  return createNumericEvaluator(expression, allowedSymbols);
}

async function numericEvaluatorWithRestrictions(expression: string, allowedSymbols: readonly string[] = []) {
  const { base: baseExpression, restrictions } = separateGraphRestrictions(expression);
  const evaluate = await numericEvaluator(baseExpression, allowedSymbols);
  const compileComparison = async (source: string) => {
    const chained = source.match(/^(.+?)(<=|>=|<|>)(.+?)(<=|>=|<|>)(.+)$/);
    const pairs = chained
      ? [[chained[1], chained[2], chained[3]], [chained[3], chained[4], chained[5]]]
      : (() => {
        const match = source.match(/^(.+?)(<=|>=|=|<|>)(.+)$/);
        return match ? [[match[1], match[2], match[3]]] : [];
      })();
    if (!pairs.length) {
      const condition = await numericEvaluator(source, allowedSymbols);
      return (values: Record<string, number>) => Boolean(condition(values));
    }
    const evaluators = await Promise.all(pairs.map(async ([left, operator, right]) => ({
      left: await numericEvaluator(left.trim(), allowedSymbols), operator, right: await numericEvaluator(right.trim(), allowedSymbols),
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

function captureResearchPreview(panel: HTMLElement | null): string | null {
  try {
    return panel?.querySelector<HTMLCanvasElement>('.research-tools-panel__body canvas')?.toDataURL('image/png') ?? null;
  } catch {
    return null;
  }
}

function collectResearchPdfSections(panel: HTMLElement | null, tool: ResearchTool): ResearchPdfSection[] {
  if (!panel) return [];
  const values = [...panel.querySelectorAll<MathfieldElement>('math-field')]
    .map((field) => field.value.trim())
    .filter(Boolean);
  const sectionFor = (heading: string, selector: string) => ({
    heading,
    lines: [...panel.querySelectorAll<HTMLElement>(selector)]
      .map((element) => element.innerText.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  });
  if (tool === 'scientific') {
    return [
      { heading: 'Complete scientific history', lines: values },
      sectionFor('Numerical checks', '.scientific-history-row small'),
    ];
  }
  return [
    { heading: 'Equations and constructions', lines: values },
    sectionFor('Parameters and measurements', '.graph-parameter, .graph-calculus output, .geometry-expression-row, .geometry-point-list > div, .geometry3d-points > div > div, .geometry3d-list button, .geometry3d-measurement, .research-marker-list li'),
    sectionFor('Viewport and method', '.graph-settings-popover label, .geometry-options label, .geometry3d-help, .graph-expression-list > p'),
  ];
}

function slugifyResearchFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'research';
}

const GRAPH_COLORS = ['#9a482c', '#3777a5', '#6b8e4e', '#8e5aa4', '#d18425', '#258f87'];

function isResearchCalculationLatex(latex: string): boolean {
  return /\\(?:int|iint|iiint|oint|sum|prod|lim|det|frac\s*\{(?:d|\\partial))|\\begin\{(?:matrix|bmatrix|pmatrix|vmatrix|Vmatrix)\}/.test(latex);
}

function usePersistentResearchState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const objectMatch = key.match(/^mathkhata:research-object:([^:]+):(.+)$/);
  const sourceMatch = key.match(/^mathkhata:research:[^:]+:(.+)$/);
  const objectId = objectMatch?.[1] ?? null;
  const documentKey = objectMatch?.[2] ?? sourceMatch?.[1] ?? key;
  const documentValue = useNotebookStore((store) => {
    if (!objectId) return store.notebook?.research.values[documentKey];
    const object = store.notebook?.pages.flatMap((page) => page.objects).find((candidate) => candidate.id === objectId);
    return object?.type === 'research' ? object.snapshot.values[documentKey] : undefined;
  });
  const updateResearchValue = useNotebookStore((store) => store.updateResearchValue);
  const updateResearchObjectValue = useNotebookStore((store) => store.updateResearchObjectValue);
  const initialRef = useRef(initialValue);
  const previousDocumentValue = useRef(documentValue);
  const [state, setState] = useState<T>(() => {
    if (documentValue !== undefined) return documentValue as T;
    try {
      const saved = window.localStorage.getItem(key);
      return saved === null ? initialValue : JSON.parse(saved) as T;
    } catch {
      return initialValue;
    }
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (documentValue !== undefined) {
      stateRef.current = documentValue as T;
      setState(documentValue as T);
    } else if (previousDocumentValue.current !== undefined) {
      stateRef.current = initialRef.current;
      setState(initialRef.current);
    }
    previousDocumentValue.current = documentValue;
  }, [documentValue]);
  useEffect(() => {
    if (documentValue !== undefined) return;
    try {
      if (window.localStorage.getItem(key) === null) return;
      if (objectId) updateResearchObjectValue(objectId, documentKey, state as ResearchValue);
      else updateResearchValue(documentKey, state as ResearchValue);
      window.localStorage.removeItem(key);
    } catch { /* Legacy storage ingestion remains best-effort. */ }
  }, [documentKey, documentValue, key, objectId, state, updateResearchObjectValue, updateResearchValue]);
  const update: Dispatch<SetStateAction<T>> = useCallback((next) => {
    const resolved = typeof next === 'function' ? (next as (value: T) => T)(stateRef.current) : next;
    stateRef.current = resolved;
    setState(resolved);
    if (objectId) updateResearchObjectValue(objectId, documentKey, resolved as ResearchValue);
    else updateResearchValue(documentKey, resolved as ResearchValue);
  }, [documentKey, objectId, updateResearchObjectValue, updateResearchValue]);
  return [state, update];
}

function ResearchMathField({
  id,
  value,
  label,
  placeholder,
  onChange,
  onEnter,
}: {
  id: string;
  value: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  const cleanup = useRef<(() => void) | null>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const attach = useCallback((field: MathfieldElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    fieldRef.current = field;
    if (!field) return;
    field.value = value;
    field.mathVirtualKeyboardPolicy = 'manual';
    field.smartFence = true;
    // Keep ordinary keyboard shorthand consistent with the rest of the
    // notebook: typing `int` produces a structured integral. Construction
    // names such as point/cube are inserted by the compact starter below, so
    // users never have to fight that mathematical shortcut.
    field.inlineShortcuts = { ...field.inlineShortcuts, int: '\\int_{#?}^{#?}' };
    field.placeholder = placeholder ?? '';
    const unregister = registerMathfield(id, field, (next) => changeRef.current(next));
    const dismissFromOutside = (event: PointerEvent) => {
      dismissMathfieldMenuFromOutsidePointer(field, event);
    };
    document.addEventListener('pointerdown', dismissFromOutside, true);
    cleanup.current = () => {
      document.removeEventListener('pointerdown', dismissFromOutside, true);
      unregister();
    };
  }, [id, placeholder]);
  useEffect(() => {
    if (fieldRef.current && fieldRef.current.value !== value) fieldRef.current.value = value;
  }, [value]);
  useEffect(() => () => cleanup.current?.(), []);
  return <math-field
    class="research-math-field"
    aria-label={label}
    ref={attach}
    onFocus={(event) => {
      setActiveMathfield(id);
      focusMathfieldElement(event.currentTarget as MathfieldElement);
    }}
    onPointerDown={() => setActiveMathfield(id)}
    onInput={(event) => onChange((event.currentTarget as MathfieldElement).value)}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && onEnter) {
        event.preventDefault();
        onEnter();
      }
    }}
  />;
}

function ResearchExpressionResult({ latex }: { latex: string }) {
  const [result, setResult] = useState<{ latex: string; verified: boolean; message?: string; method?: string; decimal?: string } | null>(null);
  const isCalculation = /\\(?:int|iint|iiint|oint|sum|prod|lim|det|frac\s*\{d)|\\begin\{(?:matrix|bmatrix|pmatrix|vmatrix|Vmatrix)\}/.test(latex);
  useEffect(() => {
    let active = true;
    if (!isCalculation || !latex.trim()) { setResult(null); return () => { active = false; }; }
    void evaluateResearchLatex(latex).then((answer) => {
      if (active) setResult({ latex: answer.latex, verified: answer.verified, method: answer.method, decimal: answer.decimal });
    }).catch((error: unknown) => {
      if (active) setResult({ latex: '', verified: false, message: error instanceof Error ? error.message : 'Incomplete or unsupported expression. Nothing was calculated silently.' });
    });
    return () => { active = false; };
  }, [isCalculation, latex]);
  if (!isCalculation || !result) return null;
  return <div className="research-expression-result">
    {result.latex ? <><span>{result.method ?? (result.verified ? 'Checked locally' : 'Result')}</span><ScientificMath latex={result.latex} label="Research expression result" />{result.decimal && result.decimal !== result.latex && <small>Numerical check: {result.decimal}</small>}</> : <p>{result.message}</p>}
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('mathnotebook:aion-question', { detail: `Show complete, rigorous steps for this research expression. Preserve the notation and verify the final result where possible:\n${latex}` }))}>Show steps in AION</button>
  </div>;
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

interface ResearchViewport {
  centerX: number;
  centerY: number;
  scale: number;
}

const SCIENTIFIC_VIEW_MIN_SCALE = .001;
const SCIENTIFIC_VIEW_MAX_SCALE = 100_000_000;
const SCIENTIFIC_OVERVIEW_HALF_RANGE = 100_000;
const SCIENTIFIC_DETAIL_STEP = .00001;

function clampScientificScale(scale: number) {
  return Math.max(SCIENTIFIC_VIEW_MIN_SCALE, Math.min(SCIENTIFIC_VIEW_MAX_SCALE, scale));
}

function scientificOverviewScale(width: number, height: number) {
  return clampScientificScale(Math.min(width, height) / (SCIENTIFIC_OVERVIEW_HALF_RANGE * 2));
}

function formatGraphNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < Number.EPSILON) return '0';
  const absolute = Math.abs(value);
  if (absolute <= 1e-4 || absolute >= 1e5) return value.toExponential(3).replace('e+', 'e');
  return Number(value.toPrecision(6)).toString();
}

function useSmoothViewportZoom(
  viewport: ResearchViewport,
  setViewport: Dispatch<SetStateAction<ResearchViewport>>,
  minimumScale: number,
  maximumScale: number,
) {
  const viewportRef = useRef(viewport);
  const targetScaleRef = useRef(viewport.scale);
  const animationRef = useRef<number | null>(null);
  const animationStartRef = useRef({ time: 0, scale: viewport.scale });
  viewportRef.current = viewport;

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    targetScaleRef.current = viewportRef.current.scale;
  }, []);

  const animateScale = useCallback((factor: number) => {
    targetScaleRef.current = Math.max(minimumScale, Math.min(maximumScale, targetScaleRef.current * factor));
    if (animationRef.current !== null) return;
    animationStartRef.current = { time: performance.now(), scale: viewportRef.current.scale };
    const step = (timestamp: number) => {
      const start = animationStartRef.current;
      const targetScale = targetScaleRef.current;
      const progress = Math.min(1, Math.max(0, (timestamp - start.time) / 180));
      const eased = 1 - (1 - progress) ** 3;
      const nextScale = progress >= 1 ? targetScale : start.scale * (targetScale / start.scale) ** eased;
      setViewport((current) => {
        const next = { ...current, scale: nextScale };
        viewportRef.current = next;
        return next;
      });
      if (progress >= 1) {
        animationRef.current = null;
        return;
      }
      animationRef.current = requestAnimationFrame(step);
    };
    animationRef.current = requestAnimationFrame(step);
  }, [maximumScale, minimumScale, setViewport]);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
  }, []);

  return { animateScale, cancelAnimation };
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

interface GraphIntersectionMarker {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
}

type Compiled2DGraphExpression =
  | { id: number; kind: 'y'; color: string; evaluate: (values: Record<string, number>) => number }
  | { id: number; kind: 'x'; color: string; evaluate: (values: Record<string, number>) => number }
  | { id: number; kind: 'implicit'; color: string; evaluate: (values: Record<string, number>) => number }
  | { id: number; kind: 'point'; color: string; evaluateX: (values: Record<string, number>) => number; evaluateY: (values: Record<string, number>) => number }
  | { id: number; kind: 'parametric'; color: string; evaluateX: (values: Record<string, number>) => number; evaluateY: (values: Record<string, number>) => number };

function Graph2D({ storagePrefix }: { storagePrefix: string }) {
  const [expressions, setExpressions] = usePersistentResearchState<GraphExpression[]>(`${storagePrefix}:2d:expressions`, []);
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
  const [hoverIntersection, setHoverIntersection] = useState<GraphIntersectionMarker | null>(null);
  const [intersectionMarkers, setIntersectionMarkers] = usePersistentResearchState<GraphIntersectionMarker[]>(`${storagePrefix}:2d:intersection-markers`, []);
  const [calculus, setCalculus] = useState({ expressionId: 0, lower: 0, upper: 1, point: 0 });
  const [calculusOverlay, setCalculusOverlay] = useState<null | { kind: 'integral' | 'derivative'; expressionId: number; value: number; lower?: number; upper?: number; point?: number; slope?: number; y?: number }>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; centerX: number; centerY: number } | null>(null);
  const evaluatorsRef = useRef<Array<{ id: number; color: string; evaluate: (values: Record<string, number>) => number }>>([]);
  const intersectionCandidatesRef = useRef<Array<GraphIntersectionMarker & { screenX: number; screenY: number }>>([]);
  const compiledCacheRef = useRef<{ key: string; expressions: Compiled2DGraphExpression[]; issues: string[] } | null>(null);
  const { animateScale, cancelAnimation } = useSmoothViewportZoom(viewport, setViewport, SCIENTIFIC_VIEW_MIN_SCALE, SCIENTIFIC_VIEW_MAX_SCALE);

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
      context.fillStyle = '#ffffff';
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
            context.strokeStyle = '#e9edef'; context.lineWidth = .7;
            for (let x = Math.ceil(worldLeft / minorX) * minorX; x <= worldRight; x += minorX) {
              if (Math.abs(x / xStep - Math.round(x / xStep)) < 1e-7) continue;
              const px = screenX(x); context.beginPath(); context.moveTo(px, 0); context.lineTo(px, height); context.stroke();
            }
          }
          if (minorY * viewport.scale >= 7) {
            context.strokeStyle = '#e9edef'; context.lineWidth = .7;
            for (let y = Math.ceil(worldBottom / minorY) * minorY; y <= worldTop; y += minorY) {
              if (Math.abs(y / yStep - Math.round(y / yStep)) < 1e-7) continue;
              const py = screenY(y); context.beginPath(); context.moveTo(0, py); context.lineTo(width, py); context.stroke();
            }
          }
        }
        if (settings.showGrid && settings.gridMode === 'polar') {
          const originX = screenX(0); const originY = screenY(0);
          const maxRadius = Math.hypot(Math.max(Math.abs(worldLeft), Math.abs(worldRight)), Math.max(Math.abs(worldBottom), Math.abs(worldTop)));
          context.strokeStyle = '#d6dcdf'; context.lineWidth = 1;
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
          context.strokeStyle = axis ? '#5d6266' : '#cbd2d6';
          context.lineWidth = axis ? 1.8 : 1.05;
          context.beginPath(); context.moveTo(px, 0); context.lineTo(px, height); context.stroke();
          if (settings.showNumbers && settings.showAxes && !axis) {
            context.fillStyle = '#565c60';
            context.fillText(formatGraphNumber(x), px, Math.min(height - 14, Math.max(3, screenY(0) + 4)));
          }
        }
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        for (let y = Math.ceil(worldBottom / yStep) * yStep; y <= worldTop; y += yStep) {
          const py = screenY(y); const axis = Math.abs(y) < yStep / 100;
          if (!settings.showGrid && !(settings.showAxes && axis)) continue;
          context.strokeStyle = axis ? '#5d6266' : '#cbd2d6';
          context.lineWidth = axis ? 1.8 : 1.05;
          context.beginPath(); context.moveTo(0, py); context.lineTo(width, py); context.stroke();
          if (settings.showNumbers && settings.showAxes && !axis) {
            context.fillStyle = '#565c60';
            context.fillText(formatGraphNumber(y), Math.min(width - 48, Math.max(4, screenX(0) + 5)), py);
          }
        }
        if (settings.showAxes) {
          context.fillStyle = '#41474b'; context.font = 'bold 11px ui-monospace, monospace';
          context.textAlign = 'right'; context.textBaseline = 'top'; context.fillText(settings.xLabel || 'x', width - 8, Math.max(4, Math.min(height - 16, screenY(0) + 5)));
          context.textAlign = 'left'; context.textBaseline = 'top'; context.fillText(settings.yLabel || 'y', Math.max(5, Math.min(width - 18, screenX(0) + 6)), 6);
        }

        const active = expressions.filter((entry) => entry.visible && entry.expression.trim());
        const parameterValues: Record<string, number> = {};
        active.forEach((entry) => {
          const parameter = entry.expression.trim().match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/);
          if (parameter && !['x', 'y'].includes(parameter[1])) parameterValues[parameter[1]] = Number(parameter[2]);
        });
        const issues: string[] = [];
        const allowedSymbols = [...Object.keys(parameterValues), 'x', 'y', 't'];
        const cacheKey = JSON.stringify(active.map((entry) => [entry.id, entry.expression, entry.color]));
        let compiled = compiledCacheRef.current?.key === cacheKey ? compiledCacheRef.current.expressions : null;
        if (compiledCacheRef.current?.key === cacheKey) issues.push(...compiledCacheRef.current.issues);
        if (!compiled) compiled = (await Promise.all(active.map(async (entry, index): Promise<Compiled2DGraphExpression | null> => {
          try {
            const source = entry.expression.trim();
            if (isResearchCalculationLatex(source)) return null;
            if (/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/.test(source) && !/^[xy]\s*=/.test(source)) return null;
            const { base, restrictions } = separateGraphRestrictions(source);
            const restricted = (value: string) => `${value}${restrictions.map((condition) => `{${condition}}`).join('')}`;
            const tuple = base.match(/^\((.*)\)$/);
            const coordinates = tuple ? splitTopLevelComma(tuple[1]) : null;
            if (coordinates) {
              const isParametric = /\bt\b/.test(coordinates[0]) || /\bt\b/.test(coordinates[1]);
              return {
                id: entry.id,
                kind: isParametric ? 'parametric' : 'point',
                color: entry.color,
                evaluateX: await numericEvaluatorWithRestrictions(restricted(coordinates[0]), allowedSymbols),
                evaluateY: await numericEvaluatorWithRestrictions(restricted(coordinates[1]), allowedSymbols),
              };
            }
            const yExplicit = base.match(/^y\s*=\s*(.+)$/i);
            if (yExplicit) return { id: entry.id, kind: 'y', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(restricted(yExplicit[1]), allowedSymbols) };
            const xExplicit = base.match(/^x\s*=\s*(.+)$/i);
            if (xExplicit) return { id: entry.id, kind: 'x', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(restricted(xExplicit[1]), allowedSymbols) };
            const equals = base.indexOf('=');
            if (equals > 0) {
              const left = base.slice(0, equals); const right = base.slice(equals + 1);
              return { id: entry.id, kind: 'implicit', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(restricted(`(${left})-(${right})`), allowedSymbols) };
            }
            return { id: entry.id, kind: 'y', color: entry.color, evaluate: await numericEvaluatorWithRestrictions(restricted(base), allowedSymbols) };
          } catch {
            issues.push(`Line ${index + 1} is not graphable yet; other valid lines remain active.`);
            return null;
          }
        }))).filter((entry): entry is Compiled2DGraphExpression => Boolean(entry));
        if (cancelled) return;
        compiledCacheRef.current = { key: cacheKey, expressions: compiled, issues: [...issues] };
        evaluatorsRef.current = compiled.filter((entry): entry is Extract<Compiled2DGraphExpression, { kind: 'y' }> => entry.kind === 'y').map((entry) => ({ id: entry.id, color: entry.color, evaluate: (values) => entry.evaluate({ ...parameterValues, ...values }) }));
        for (const entry of compiled) {
          context.strokeStyle = entry.color;
          context.lineWidth = 2.65;
          context.lineJoin = 'round';
          if (entry.kind === 'point') {
            const x = entry.evaluateX(parameterValues); const y = entry.evaluateY(parameterValues);
            if (Number.isFinite(x) && Number.isFinite(y)) {
              context.fillStyle = entry.color; context.strokeStyle = '#ffffff'; context.lineWidth = 2;
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
        const intersectionCandidates: Array<GraphIntersectionMarker & { screenX: number; screenY: number }> = [];
        const yFunctions = evaluatorsRef.current;
        for (let firstIndex = 0; firstIndex < yFunctions.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < yFunctions.length; secondIndex += 1) {
            const first = yFunctions[firstIndex]; const second = yFunctions[secondIndex];
            let previousX = worldLeft;
            let previousDelta = first.evaluate({ x: previousX }) - second.evaluate({ x: previousX });
            for (let sample = 1; sample <= Math.max(160, Math.round(width / 3)); sample += 1) {
              const x = worldLeft + (worldRight - worldLeft) * sample / Math.max(160, Math.round(width / 3));
              const delta = first.evaluate({ x }) - second.evaluate({ x });
              if (Number.isFinite(previousDelta) && Number.isFinite(delta) && (previousDelta === 0 || delta === 0 || previousDelta * delta < 0)) {
                let left = previousX; let right = x;
                for (let iteration = 0; iteration < 18; iteration += 1) {
                  const middle = (left + right) / 2;
                  const leftDelta = first.evaluate({ x: left }) - second.evaluate({ x: left });
                  const middleDelta = first.evaluate({ x: middle }) - second.evaluate({ x: middle });
                  if (leftDelta * middleDelta <= 0) right = middle; else left = middle;
                }
                const crossingX = (left + right) / 2;
                const crossingY = (first.evaluate({ x: crossingX }) + second.evaluate({ x: crossingX })) / 2;
                const candidate = { id: `${first.id}-${second.id}-${crossingX.toPrecision(8)}`, x: crossingX, y: crossingY, color: '#3f315c', label: `Lines ${first.id} & ${second.id}`, screenX: screenX(crossingX), screenY: screenY(crossingY) };
                if ([candidate.screenX, candidate.screenY].every(Number.isFinite) && !intersectionCandidates.some((item) => Math.hypot(item.screenX - candidate.screenX, item.screenY - candidate.screenY) < 7)) intersectionCandidates.push(candidate);
              }
              previousX = x; previousDelta = delta;
            }
          }
        }
        intersectionCandidatesRef.current = intersectionCandidates;
        for (const marker of intersectionMarkers) {
          context.save(); context.fillStyle = marker.color; context.strokeStyle = '#ffffff'; context.lineWidth = 2;
          context.beginPath(); context.arc(screenX(marker.x), screenY(marker.y), 6, 0, Math.PI * 2); context.fill(); context.stroke();
          context.fillStyle = '#3f315c'; context.font = 'bold 10px ui-monospace, monospace'; context.fillText(`(${Number(marker.x.toPrecision(5))}, ${Number(marker.y.toPrecision(5))})`, screenX(marker.x) + 8, screenY(marker.y) - 8); context.restore();
        }
        if (hoverIntersection) {
          context.save(); context.strokeStyle = '#3f315c'; context.lineWidth = 2; context.setLineDash([3, 2]);
          context.beginPath(); context.arc(screenX(hoverIntersection.x), screenY(hoverIntersection.y), 8, 0, Math.PI * 2); context.stroke(); context.restore();
        }
        if (calculusOverlay) {
          const selected = evaluatorsRef.current.find((entry) => entry.id === calculusOverlay.expressionId);
          if (selected && calculusOverlay.kind === 'integral' && calculusOverlay.lower !== undefined && calculusOverlay.upper !== undefined) {
            const lower = Math.min(calculusOverlay.lower, calculusOverlay.upper);
            const upper = Math.max(calculusOverlay.lower, calculusOverlay.upper);
            context.save();
            const fillSignedArea = (x0: number, y0: number, x1: number, y1: number, positive: boolean) => {
              context.fillStyle = positive ? 'rgba(43,132,92,.34)' : 'rgba(210,73,55,.34)';
              context.beginPath(); context.moveTo(screenX(x0), screenY(0)); context.lineTo(screenX(x0), screenY(y0)); context.lineTo(screenX(x1), screenY(y1)); context.lineTo(screenX(x1), screenY(0)); context.closePath(); context.fill();
            };
            for (let index = 0; index < 240; index += 1) {
              const x0 = lower + (upper - lower) * index / 240;
              const x1 = lower + (upper - lower) * (index + 1) / 240;
              const y0 = selected.evaluate({ x: x0 }); const y1 = selected.evaluate({ x: x1 });
              for (const segment of splitSignedAreaSegment(x0, y0, x1, y1)) {
                fillSignedArea(segment.x0, segment.y0, segment.x1, segment.y1, segment.positive);
              }
            }
            context.restore();
          }
          if (selected && calculusOverlay.kind === 'derivative' && calculusOverlay.point !== undefined && calculusOverlay.slope !== undefined && calculusOverlay.y !== undefined) {
            context.save();
            context.strokeStyle = '#3f315c'; context.lineWidth = 1.7; context.setLineDash([7, 5]);
            context.beginPath();
            const leftY = calculusOverlay.y + calculusOverlay.slope * (worldLeft - calculusOverlay.point);
            const rightY = calculusOverlay.y + calculusOverlay.slope * (worldRight - calculusOverlay.point);
            context.moveTo(screenX(worldLeft), screenY(leftY)); context.lineTo(screenX(worldRight), screenY(rightY)); context.stroke();
            context.setLineDash([]); context.fillStyle = '#3f315c'; context.beginPath(); context.arc(screenX(calculusOverlay.point), screenY(calculusOverlay.y), 4.5, 0, Math.PI * 2); context.fill();
            context.restore();
          }
        }
        setError(issues.join(' '));
      } catch {
        evaluatorsRef.current = [];
        setError('Check each visible line. Try y=sin(x), x=2, (x-2)^2+(y+1)^2=9, (cos(t),sin(t)), or a=2.');
      }
    };
    void draw();
    return () => { cancelled = true; };
  }, [calculusOverlay, canvasSize.height, canvasSize.width, expressions, hoverIntersection, intersectionMarkers, settings, viewport]);

  const updateExpression = (id: number, patch: Partial<GraphExpression>) => {
    setExpressions((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  };

  const resolveCalculusEvaluator = async () => {
    const parameters: Record<string, number> = {};
    expressions.forEach((entry) => {
      const match = entry.expression.trim().match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/);
      if (match && !['x', 'y'].includes(match[1])) parameters[match[1]] = Number(match[2]);
    });
    const candidates = expressions.filter((entry) => {
      const source = entry.expression.trim();
      return source && !isResearchCalculationLatex(source) && (/^y\s*=/i.test(source) || !source.includes('='));
    });
    const sourceEntry = candidates.find((entry) => entry.id === calculus.expressionId) ?? candidates[0];
    if (!sourceEntry) return null;
    const source = sourceEntry.expression.trim();
    const expression = source.match(/^y\s*=\s*(.+)$/i)?.[1] ?? source;
    try {
      const compiled = await numericEvaluatorWithRestrictions(expression, [...Object.keys(parameters), 'x']);
      const resolved = { id: sourceEntry.id, color: sourceEntry.color, evaluate: (values: Record<string, number>) => compiled({ ...parameters, ...values }) };
      evaluatorsRef.current = [...evaluatorsRef.current.filter((entry) => entry.id !== resolved.id), resolved];
      return resolved;
    } catch {
      return null;
    }
  };

  const applyAxisBounds = () => {
    const xRange = settings.xMax - settings.xMin;
    const yRange = settings.yMax - settings.yMin;
    if (!(xRange > 0) || !(yRange > 0)) return;
    setViewport({
      centerX: (settings.xMin + settings.xMax) / 2,
      centerY: (settings.yMin + settings.yMax) / 2,
      scale: clampScientificScale(Math.min(canvasSize.width / xRange, canvasSize.height / yRange)),
    });
  };

  return (
    <section className="research-graph-lab research-graph-lab--2d">
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
            <label><span>{index + 1}</span><ResearchMathField id={`research-2d-${entry.id}`} label={`Expression ${index + 1}`} placeholder="y=sin(x)" value={entry.expression} onChange={(expression) => updateExpression(entry.id, { expression })} /></label>
            {expressions.length > 1 && <button type="button" aria-label={`Remove expression ${index + 1}`} onClick={() => setExpressions((current) => current.filter((item) => item.id !== entry.id))}>×</button>}
            {isParameter && parameter && <label className="graph-inline-slider"><span>{parameter[1]} = {Number(parameter[2]).toFixed(2)}</span><input type="range" aria-label={`Parameter ${parameter[1]} value`} min="-10" max="10" step="0.1" value={Number(parameter[2])} onChange={(event) => updateExpression(entry.id, { expression: `${parameter[1]}=${event.target.value}` })} /></label>}
            <ResearchExpressionResult latex={entry.expression} />
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
        <section className="graph-calculus" aria-label="Graph calculus measurements">
          <header><strong>Measure from graph</strong><span>Numerical check</span></header>
          <label>Function<select aria-label="Graph calculus function" value={calculus.expressionId || ''} onChange={(event) => setCalculus((current) => ({ ...current, expressionId: Number(event.target.value) }))}>
            <option value="">Choose a plotted y-function</option>
            {expressions.filter((entry) => { const source = entry.expression.trim(); return source && !isResearchCalculationLatex(source) && (/^y\s*=/i.test(source) || !source.includes('=')); }).map((entry, index) => <option key={entry.id} value={entry.id}>Line {index + 1}: {entry.expression}</option>)}
          </select></label>
          <div className="graph-calculus__bounds"><label>Lower a<input type="number" step="any" value={calculus.lower} onChange={(event) => setCalculus((current) => ({ ...current, lower: Number(event.target.value) }))} /></label><label>Upper b<input type="number" step="any" value={calculus.upper} onChange={(event) => setCalculus((current) => ({ ...current, upper: Number(event.target.value) }))} /></label></div>
          <button type="button" onClick={() => void (async () => {
            const selected = await resolveCalculusEvaluator();
            if (!selected) { setError('Choose a valid plotted y-function before measuring an integral.'); return; }
            const value = simpsonIntegral((x) => selected.evaluate({ x }), calculus.lower, calculus.upper);
            if (!Number.isFinite(value)) { setError('The numerical integral is undefined or discontinuous on these bounds.'); return; }
            setCalculus((current) => ({ ...current, expressionId: selected.id }));
            setCalculusOverlay({ kind: 'integral', expressionId: selected.id, value, lower: calculus.lower, upper: calculus.upper });
            setError('');
          })()}>Measure definite integral</button>
          <label>At x<input type="number" step="any" value={calculus.point} onChange={(event) => setCalculus((current) => ({ ...current, point: Number(event.target.value) }))} /></label>
          <button type="button" onClick={() => void (async () => {
            const selected = await resolveCalculusEvaluator();
            if (!selected) { setError('Choose a valid plotted y-function before measuring a derivative.'); return; }
            const h = Math.max(1e-6, Math.abs(calculus.point) * 1e-5);
            const y = selected.evaluate({ x: calculus.point });
            const slope = (selected.evaluate({ x: calculus.point + h }) - selected.evaluate({ x: calculus.point - h })) / (2 * h);
            if (![y, slope].every(Number.isFinite)) { setError('The derivative is undefined at this point.'); return; }
            setCalculus((current) => ({ ...current, expressionId: selected.id }));
            setCalculusOverlay({ kind: 'derivative', expressionId: selected.id, value: slope, point: calculus.point, slope, y });
            setError('');
          })()}>Measure derivative and tangent</button>
          {calculusOverlay && <output><b>{calculusOverlay.kind === 'integral' ? 'Integral' : 'Derivative'}</b> ≈ {Number(calculusOverlay.value.toPrecision(12))}<button type="button" onClick={() => setCalculusOverlay(null)}>Clear overlay</button></output>}
        </section>
        {intersectionMarkers.length > 0 && <section className="research-marker-list" aria-label="Saved graph intersections"><header><strong>Marked intersections</strong><span>{intersectionMarkers.length}</span></header><ul>{intersectionMarkers.map((marker) => <li key={marker.id}><span>{marker.label}: ({Number(marker.x.toPrecision(6))}, {Number(marker.y.toPrecision(6))})</span><button type="button" aria-label={`Delete intersection marker at ${marker.x}, ${marker.y}`} onClick={() => setIntersectionMarkers((current) => current.filter((item) => item.id !== marker.id))}>×</button></li>)}</ul></section>}
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
              <div className="graph-scale-presets" aria-label="Scientific zoom presets">
                <button type="button" disabled={settings.lockViewport} onClick={() => { cancelAnimation(); setViewport({ centerX: 0, centerY: 0, scale: scientificOverviewScale(canvasSize.width, canvasSize.height) }); }}>Show ±10⁵ range</button>
                <button type="button" disabled={settings.lockViewport} onClick={() => { cancelAnimation(); setViewport((current) => ({ ...current, scale: clampScientificScale(64 / SCIENTIFIC_DETAIL_STEP) })); }}>Show 10⁻⁵ detail</button>
              </div>
              <button type="button" className="research-primary" onClick={applyAxisBounds}>Apply bounds</button>
            </section>}
          </div>
          <button type="button" aria-label="Zoom in" disabled={settings.lockViewport} onClick={() => animateScale(2)}>+</button>
          <button type="button" aria-label="Zoom out" disabled={settings.lockViewport} onClick={() => animateScale(.5)}>−</button>
          <button type="button" aria-label="Reset graph view" onClick={() => { cancelAnimation(); setViewport({ centerX: 0, centerY: 0, scale: 52 }); }}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          aria-label="Interactive 2D graph"
          data-viewport-scale={viewport.scale}
          onPointerDown={(event) => {
            cancelAnimation();
            const canvas = event.currentTarget; const bounds = canvas.getBoundingClientRect();
            const pixelX = (event.clientX - bounds.left) * canvas.width / bounds.width; const pixelY = (event.clientY - bounds.top) * canvas.height / bounds.height;
            const crossing = intersectionCandidatesRef.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.screenX - pixelX, candidate.screenY - pixelY) })).sort((a, b) => a.distance - b.distance)[0];
            if (crossing && crossing.distance <= 15) {
              const marker: GraphIntersectionMarker = { id: crossing.candidate.id, x: crossing.candidate.x, y: crossing.candidate.y, color: crossing.candidate.color, label: crossing.candidate.label };
              setIntersectionMarkers((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker]);
              setHoverIntersection(marker); return;
            }
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
            const pixelX = (event.clientX - bounds.left) * ratioX; const pixelY = (event.clientY - bounds.top) * ratioY;
            const crossing = intersectionCandidatesRef.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.screenX - pixelX, candidate.screenY - pixelY) })).sort((a, b) => a.distance - b.distance)[0];
            if (crossing && crossing.distance <= 15) { setHoverIntersection(crossing.candidate); setTrace(null); return; }
            setHoverIntersection(null);
            const x = viewport.centerX + (pixelX - canvas.width / 2) / viewport.scale;
            const candidates = evaluatorsRef.current.map((entry) => ({ x, y: entry.evaluate({ x }), color: entry.color })).filter((point) => Number.isFinite(point.y));
            const mouseY = viewport.centerY - (pixelY - canvas.height / 2) / viewport.scale;
            candidates.sort((left, right) => Math.abs(left.y - mouseY) - Math.abs(right.y - mouseY));
            setTrace(candidates[0] ?? null);
          }}
          onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { dragRef.current = null; }}
          onPointerLeave={() => { if (!dragRef.current) { setTrace(null); setHoverIntersection(null); } }}
          onWheel={(event) => {
            event.preventDefault();
            if (settings.lockViewport) return;
            cancelAnimation();
            const canvas = event.currentTarget;
            const bounds = canvas.getBoundingClientRect();
            const px = (event.clientX - bounds.left) * canvas.width / bounds.width;
            const py = (event.clientY - bounds.top) * canvas.height / bounds.height;
            setViewport((view) => {
              const worldX = view.centerX + (px - canvas.width / 2) / view.scale;
              const worldY = view.centerY - (py - canvas.height / 2) / view.scale;
              const scale = clampScientificScale(view.scale * Math.exp(-event.deltaY * .0015));
              return {
                centerX: worldX - (px - canvas.width / 2) / scale,
                centerY: worldY + (py - canvas.height / 2) / scale,
                scale,
              };
            });
          }}
        />
        {(hoverIntersection || trace) && <output className="graph-trace" style={{ '--graph-color': (hoverIntersection ?? trace)!.color } as React.CSSProperties}>{hoverIntersection ? <>Intersection: x = {formatGraphNumber(hoverIntersection.x)} · y = {formatGraphNumber(hoverIntersection.y)} · click to mark</> : <>x = {formatGraphNumber(trace!.x)} · y = {formatGraphNumber(trace!.y)}</>}</output>}
        {error && <p className="research-tool-error graph-error">{error}</p>}
      </div>
    </section>
  );
}

function LogLogGraph({ storagePrefix }: { storagePrefix: string }) {
  const [expressions, setExpressions] = usePersistentResearchState<GraphExpression[]>(`${storagePrefix}:loglog:expressions`, []);
  const [viewport, setViewport] = usePersistentResearchState(`${storagePrefix}:loglog:viewport`, { centerX: 0, centerY: 0, scale: 28 });
  const [markers, setMarkers] = usePersistentResearchState<GraphIntersectionMarker[]>(`${storagePrefix}:loglog:intersection-markers`, []);
  const [hover, setHover] = useState<GraphIntersectionMarker | null>(null);
  const [trace, setTrace] = useState<{ x: number; y: number; color: string } | null>(null);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const dragRef = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null);
  const evaluatorsRef = useRef<Array<{ id: number; color: string; evaluate: (values: Record<string, number>) => number }>>([]);
  const crossingsRef = useRef<Array<GraphIntersectionMarker & { screenX: number; screenY: number }>>([]);
  const { animateScale, cancelAnimation } = useSmoothViewportZoom(viewport, setViewport, 2, SCIENTIFIC_VIEW_MAX_SCALE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const canvas = canvasRef.current; const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const width = canvas.width; const height = canvas.height;
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
      const logLeft = viewport.centerX - width / (2 * viewport.scale); const logRight = viewport.centerX + width / (2 * viewport.scale);
      const logBottom = viewport.centerY - height / (2 * viewport.scale); const logTop = viewport.centerY + height / (2 * viewport.scale);
      const screenX = (x: number) => width / 2 + (Math.log10(x) - viewport.centerX) * viewport.scale;
      const screenY = (y: number) => height / 2 - (Math.log10(y) - viewport.centerY) * viewport.scale;
      const drawLogAxis = (vertical: boolean, minimum: number, maximum: number) => {
        for (let decade = Math.floor(minimum); decade <= Math.ceil(maximum); decade += 1) {
          for (let multiplier = 1; multiplier <= 9; multiplier += 1) {
            const logValue = decade + Math.log10(multiplier);
            if (logValue < minimum || logValue > maximum) continue;
            const pixel = vertical ? height / 2 - (logValue - viewport.centerY) * viewport.scale : width / 2 + (logValue - viewport.centerX) * viewport.scale;
            context.strokeStyle = multiplier === 1 ? '#c5cdd1' : '#e8edef'; context.lineWidth = multiplier === 1 ? 1.3 : .7;
            context.beginPath(); if (vertical) { context.moveTo(0, pixel); context.lineTo(width, pixel); } else { context.moveTo(pixel, 0); context.lineTo(pixel, height); } context.stroke();
            if (multiplier === 1) { context.fillStyle = '#777168'; context.font = '9px ui-monospace, monospace'; context.fillText(`10^${decade}`, vertical ? 5 : pixel + 3, vertical ? pixel - 4 : height - 8); }
          }
        }
      };
      drawLogAxis(false, logLeft, logRight); drawLogAxis(true, logBottom, logTop);
      const parameters: Record<string, number> = {};
      expressions.forEach((entry) => { const match = entry.expression.trim().match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/); if (match && !['x', 'y'].includes(match[1])) parameters[match[1]] = Number(match[2]); });
      const compiled: typeof evaluatorsRef.current = [];
      const issues: string[] = [];
      for (const [index, entry] of expressions.filter((item) => item.visible && item.expression.trim()).entries()) {
        const source = entry.expression.trim();
        if (/^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(-?\d*\.?\d+)$/.test(source) && !/^[xy]\s*=/.test(source)) continue;
        try {
          const explicit = source.match(/^y\s*=\s*(.+)$/i)?.[1] ?? source;
          compiled.push({ id: entry.id, color: entry.color, evaluate: await numericEvaluatorWithRestrictions(explicit, [...Object.keys(parameters), 'x']) });
        } catch { issues.push(`Line ${index + 1} is not a positive graphable y-function.`); }
      }
      if (cancelled) return;
      evaluatorsRef.current = compiled.map((entry) => ({ ...entry, evaluate: (values) => entry.evaluate({ ...parameters, ...values }) }));
      for (const entry of evaluatorsRef.current) {
        context.strokeStyle = entry.color; context.lineWidth = 2.65; context.lineJoin = 'round'; context.beginPath(); let drawing = false;
        for (let pixel = 0; pixel <= width; pixel += 2) {
          const x = 10 ** (logLeft + pixel / viewport.scale); const y = entry.evaluate({ x }); const py = y > 0 ? screenY(y) : Number.NaN;
          if (!Number.isFinite(py) || py < -height * 3 || py > height * 4) drawing = false;
          else if (!drawing) { context.moveTo(pixel, py); drawing = true; } else context.lineTo(pixel, py);
        }
        context.stroke();
      }
      const crossings: Array<GraphIntersectionMarker & { screenX: number; screenY: number }> = [];
      for (let a = 0; a < evaluatorsRef.current.length; a += 1) for (let b = a + 1; b < evaluatorsRef.current.length; b += 1) {
        const first = evaluatorsRef.current[a]; const second = evaluatorsRef.current[b]; let previousLogX = logLeft;
        let previous = first.evaluate({ x: 10 ** previousLogX }) - second.evaluate({ x: 10 ** previousLogX });
        for (let sample = 1; sample <= Math.max(180, Math.round(width / 3)); sample += 1) {
          const logX = logLeft + (logRight - logLeft) * sample / Math.max(180, Math.round(width / 3)); const x = 10 ** logX;
          const delta = first.evaluate({ x }) - second.evaluate({ x });
          if (Number.isFinite(previous) && Number.isFinite(delta) && previous * delta <= 0) {
            let left = previousLogX; let right = logX;
            for (let i = 0; i < 18; i += 1) { const middle = (left + right) / 2; const leftDelta = first.evaluate({ x: 10 ** left }) - second.evaluate({ x: 10 ** left }); const middleDelta = first.evaluate({ x: 10 ** middle }) - second.evaluate({ x: 10 ** middle }); if (leftDelta * middleDelta <= 0) right = middle; else left = middle; }
            const crossingX = 10 ** ((left + right) / 2); const crossingY = (first.evaluate({ x: crossingX }) + second.evaluate({ x: crossingX })) / 2;
            if (crossingY > 0) { const candidate = { id: `${first.id}-${second.id}-${crossingX.toPrecision(8)}`, x: crossingX, y: crossingY, color: '#3f315c', label: `Lines ${first.id} & ${second.id}`, screenX: screenX(crossingX), screenY: screenY(crossingY) }; if (!crossings.some((item) => Math.hypot(item.screenX - candidate.screenX, item.screenY - candidate.screenY) < 7)) crossings.push(candidate); }
          }
          previousLogX = logX; previous = delta;
        }
      }
      crossingsRef.current = crossings;
      for (const marker of markers) { context.fillStyle = marker.color; context.strokeStyle = '#fff'; context.lineWidth = 2; context.beginPath(); context.arc(screenX(marker.x), screenY(marker.y), 6, 0, Math.PI * 2); context.fill(); context.stroke(); }
      if (hover) { context.strokeStyle = '#3f315c'; context.lineWidth = 2; context.setLineDash([3, 2]); context.beginPath(); context.arc(screenX(hover.x), screenY(hover.y), 8, 0, Math.PI * 2); context.stroke(); context.setLineDash([]); }
      setError(issues.join(' '));
    })().catch(() => { evaluatorsRef.current = []; crossingsRef.current = []; setError('Use positive x and y values, for example y=x^2 or y=3x^0.5.'); });
    return () => { cancelled = true; };
  }, [canvasSize.height, canvasSize.width, expressions, hover, markers, viewport]);

  const updateExpression = (id: number, patch: Partial<GraphExpression>) => setExpressions((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  return <section className="research-graph-lab research-graph-lab--loglog">
    <aside className="graph-expression-list" aria-label="Log-log graph expressions"><header><strong>Log-log expressions</strong><span>{expressions.length}/12</span></header>
      {expressions.map((entry, index) => <div className="graph-expression" key={entry.id}><button type="button" className={`graph-color${entry.visible ? ' is-visible' : ''}`} style={{ '--graph-color': entry.color } as React.CSSProperties} aria-label={`${entry.visible ? 'Hide' : 'Show'} log-log expression ${index + 1}`} onClick={() => updateExpression(entry.id, { visible: !entry.visible })} /><label><span>{index + 1}</span><ResearchMathField id={`research-loglog-${entry.id}`} label={`Log-log expression ${index + 1}`} placeholder="y=x^2" value={entry.expression} onChange={(expression) => updateExpression(entry.id, { expression })} /></label><button type="button" aria-label={`Remove log-log expression ${index + 1}`} onClick={() => setExpressions((current) => current.filter((item) => item.id !== entry.id))}>×</button></div>)}
      <button type="button" className="graph-add-expression" disabled={expressions.length >= 12} onClick={() => setExpressions((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, expression: '', color: GRAPH_COLORS[current.length % GRAPH_COLORS.length], visible: true }])}>+ Add expression</button>
      {markers.length > 0 && <section className="research-marker-list" aria-label="Saved log-log intersections"><header><strong>Marked intersections</strong><span>{markers.length}</span></header><ul>{markers.map((marker) => <li key={marker.id}><span>({Number(marker.x.toPrecision(6))}, {Number(marker.y.toPrecision(6))})</span><button type="button" aria-label={`Delete log-log intersection ${marker.id}`} onClick={() => setMarkers((current) => current.filter((item) => item.id !== marker.id))}>×</button></li>)}</ul></section>}
      <p>Both axes require positive values. Try <b>y=x^2</b>, <b>y=3x^.5</b>, and <b>a=2</b>.</p>
    </aside>
    <div className="graph-stage"><div className="graph-controls" aria-label="Log-log graph view controls"><button type="button" aria-label="Zoom log-log graph in" onClick={() => animateScale(2)}>+</button><button type="button" aria-label="Zoom log-log graph out" onClick={() => animateScale(.5)}>−</button><button type="button" aria-label="Reset log-log graph to 10^-5 through 10^5" onClick={() => { cancelAnimation(); setViewport({ centerX: 0, centerY: 0, scale: 28 }); }}>⌂</button></div>
      <canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height} aria-label="Interactive log-log graph" data-viewport-scale={viewport.scale}
        onPointerDown={(event) => { cancelAnimation(); const canvas = event.currentTarget; const bounds = canvas.getBoundingClientRect(); const x = (event.clientX - bounds.left) * canvas.width / bounds.width; const y = (event.clientY - bounds.top) * canvas.height / bounds.height; const crossing = crossingsRef.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.screenX - x, candidate.screenY - y) })).sort((a, b) => a.distance - b.distance)[0]; if (crossing && crossing.distance <= 15) { const marker: GraphIntersectionMarker = { id: crossing.candidate.id, x: crossing.candidate.x, y: crossing.candidate.y, color: crossing.candidate.color, label: crossing.candidate.label }; setMarkers((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker]); return; } event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, centerX: viewport.centerX, centerY: viewport.centerY }; }}
        onPointerMove={(event) => { const canvas = event.currentTarget; const bounds = canvas.getBoundingClientRect(); const pixelX = (event.clientX - bounds.left) * canvas.width / bounds.width; const pixelY = (event.clientY - bounds.top) * canvas.height / bounds.height; if (dragRef.current) { const drag = dragRef.current; setViewport((view) => ({ ...view, centerX: drag.centerX - (event.clientX - drag.x) * canvas.width / bounds.width / view.scale, centerY: drag.centerY + (event.clientY - drag.y) * canvas.height / bounds.height / view.scale })); setHover(null); setTrace(null); return; } const crossing = crossingsRef.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.screenX - pixelX, candidate.screenY - pixelY) })).sort((a, b) => a.distance - b.distance)[0]; if (crossing && crossing.distance <= 15) { setHover(crossing.candidate); setTrace(null); return; } setHover(null); const x = 10 ** (viewport.centerX + (pixelX - canvas.width / 2) / viewport.scale); const mouseLogY = viewport.centerY - (pixelY - canvas.height / 2) / viewport.scale; const candidates = evaluatorsRef.current.map((entry) => ({ x, y: entry.evaluate({ x }), color: entry.color })).filter((point) => point.y > 0).sort((a, b) => Math.abs(Math.log10(a.y) - mouseLogY) - Math.abs(Math.log10(b.y) - mouseLogY)); setTrace(candidates[0] ?? null); }}
        onPointerUp={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragRef.current = null; }} onPointerLeave={() => { if (!dragRef.current) { setHover(null); setTrace(null); } }}
        onWheel={(event) => { event.preventDefault(); cancelAnimation(); const canvas = event.currentTarget; const bounds = canvas.getBoundingClientRect(); const px = (event.clientX - bounds.left) * canvas.width / bounds.width; const py = (event.clientY - bounds.top) * canvas.height / bounds.height; setViewport((view) => { const anchorX = view.centerX + (px - canvas.width / 2) / view.scale; const anchorY = view.centerY - (py - canvas.height / 2) / view.scale; const scale = Math.max(2, Math.min(SCIENTIFIC_VIEW_MAX_SCALE, view.scale * Math.exp(-event.deltaY * .0015))); return { centerX: anchorX - (px - canvas.width / 2) / scale, centerY: anchorY + (py - canvas.height / 2) / scale, scale }; }); }} />
      {(hover || trace) && <output className="graph-trace" style={{ '--graph-color': (hover ?? trace)!.color } as React.CSSProperties}>{hover ? <>Intersection: x = {hover.x.toPrecision(6)} · y = {hover.y.toPrecision(6)} · click to mark</> : <>x = {trace!.x.toPrecision(6)} · y = {trace!.y.toPrecision(6)}</>}</output>}{error && <p className="research-tool-error graph-error">{error}</p>}
    </div>
  </section>;
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
  const [surfaces, setSurfaces] = usePersistentResearchState<SurfaceExpression[]>(`${storagePrefix}:3d:surfaces`, []);
  const [parameters, setParameters] = usePersistentResearchState<Graph3DParameter[]>(`${storagePrefix}:3d:parameters`, []);
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
  const [markedIntersections, setMarkedIntersections] = usePersistentResearchState<Array<{ id: string; x: number; y: number; z: number }>>(`${storagePrefix}:3d:intersection-markers`, []);
  const [volumeCalculation, setVolumeCalculation] = useState({ integrand: '', dimensions: 2 as 2 | 3, xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1 });
  const [volumeResult, setVolumeResult] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const settingsPopoverRef = useRef<HTMLElement | null>(null);
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
      const target = event.target as Node;
      if (!settingsRef.current?.contains(target) && !settingsPopoverRef.current?.contains(target)) setSettingsOpen(false);
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
        const allowedSymbols = [...Object.keys(parameterValues), 'x', 'y', 'z', 't', 'u', 'v'];
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
            const evaluate = await numericEvaluatorWithRestrictions(surface.expression, allowedSymbols);
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
            const evaluateX = await numericEvaluator(surface.x, allowedSymbols);
            const evaluateY = await numericEvaluator(surface.y, allowedSymbols);
            const evaluateZ = await numericEvaluator(surface.z, allowedSymbols);
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
            const evaluate = await numericEvaluatorWithRestrictions(surface.expression, allowedSymbols);
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
            const evaluateX = await numericEvaluator(curve.x, allowedSymbols);
            const evaluateY = await numericEvaluator(curve.y, allowedSymbols);
            const evaluateZ = await numericEvaluator(curve.z, allowedSymbols);
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
            const x = (await numericEvaluator(entry.x, allowedSymbols))(parameterValues);
            const y = (await numericEvaluator(entry.y, allowedSymbols))(parameterValues);
            const z = (await numericEvaluator(entry.z, allowedSymbols))(parameterValues);
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
        for (const marker of markedIntersections) {
          const point = project(marker.x, marker.y, marker.z);
          context.save(); context.fillStyle = '#3f315c'; context.strokeStyle = '#fffefa'; context.lineWidth = 2;
          context.beginPath(); context.arc(point.x, point.y, 6, 0, Math.PI * 2); context.fill(); context.stroke();
          context.fillStyle = '#3f315c'; context.font = 'bold 9px ui-monospace, monospace'; context.fillText(`(${marker.x.toFixed(2)}, ${marker.y.toFixed(2)}, ${marker.z.toFixed(2)})`, point.x + 7, point.y - 7); context.restore();
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
  }, [bounds, camera, canvasSize.height, canvasSize.width, curves3D, domain, implicitSurfaces, markedIntersections, parameters, parametricSurfaces, perspectiveStrength, points3D, projection, renderMode, resolution, showAxes, showCube, showGrid, showNumbers, showSurfaceIntersections, surfaces]);

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
              <label><span>z =</span><ResearchMathField id={`research-3d-surface-${surface.id}`} label={`3D surface expression ${index + 1}`} value={surface.expression} onChange={(expression) => updateSurface(surface.id, { expression })} /></label>
              {surfaces.length > 1 && <button type="button" aria-label={`Remove surface ${index + 1}`} onClick={() => setSurfaces((current) => current.filter((entry) => entry.id !== surface.id))}>×</button>}
            </div>
            <div className="surface-style-row">
              <label>Color <input type="color" aria-label={`Surface ${index + 1} color`} value={surface.color} onChange={(event) => updateSurface(surface.id, { color: event.target.value })} /></label>
              <label>Opacity <input type="range" aria-label={`Surface ${index + 1} opacity`} min="0.18" max="1" step="0.05" value={surface.opacity} onChange={(event) => updateSurface(surface.id, { opacity: Number(event.target.value) })} /></label>
            </div>
            <ResearchExpressionResult latex={surface.expression} />
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
            <label><span>0 =</span><ResearchMathField id={`research-3d-implicit-${surface.id}`} label={`Implicit surface expression ${index + 1}`} value={surface.expression} onChange={(expression) => setImplicitSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, expression } : entry))} /></label>
            <button type="button" aria-label={`Remove implicit surface ${index + 1}`} onClick={() => setImplicitSurfaces((current) => current.filter((entry) => entry.id !== surface.id))}>×</button>
          </div>
          <div className="surface-style-row"><label>Color <input type="color" aria-label={`Implicit surface ${index + 1} color`} value={surface.color} onChange={(event) => setImplicitSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, color: event.target.value } : entry))} /></label><label>Opacity <input type="range" aria-label={`Implicit surface ${index + 1} opacity`} min="0.18" max="1" step="0.05" value={surface.opacity} onChange={(event) => setImplicitSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, opacity: Number(event.target.value) } : entry))} /></label></div>
        </div>)}
        <button type="button" className="graph-add-expression" disabled={implicitSurfaces.length >= 2} onClick={() => setImplicitSurfaces((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, expression: '', color: GRAPH_COLORS[(surfaces.length + current.length) % GRAPH_COLORS.length], visible: true, opacity: .72 }])}>+ Add implicit F(x,y,z)=0</button>
        <section className="graph-parameter-section" aria-label="3D graph parameters">
          <header><strong>Parameters</strong><span>Use names in any expression</span></header>
          {parameters.map((parameter, index) => <div className="graph-parameter" key={parameter.id}>
            <div><input className="parameter-name" aria-label={`Parameter ${index + 1} name`} value={parameter.name} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, name: event.target.value.replace(/[^a-zA-Z0-9_]/g, '') } : entry))} /><output>{parameter.value.toFixed(2)}</output><button type="button" aria-label={`Remove parameter ${parameter.name}`} onClick={() => setParameters((current) => current.filter((entry) => entry.id !== parameter.id))}>×</button></div>
            <input type="range" aria-label={`Parameter ${parameter.name} value`} min={parameter.min} max={parameter.max} step={parameter.step} value={parameter.value} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, value: Number(event.target.value) } : entry))} />
            <div className="parameter-range"><label>min <input type="number" value={parameter.min} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, min: Number(event.target.value) } : entry))} /></label><label>max <input type="number" value={parameter.max} onChange={(event) => setParameters((current) => current.map((entry) => entry.id === parameter.id ? { ...entry, max: Number(event.target.value) } : entry))} /></label></div>
          </div>)}
          <button type="button" className="graph-add-expression" disabled={parameters.length >= 4} onClick={() => setParameters((current) => [...current, { id: Math.max(0, ...current.map((entry) => entry.id)) + 1, name: ['a', 'b', 'c', 'd'].find((name) => !current.some((entry) => entry.name === name)) ?? `p${current.length + 1}`, value: 1, min: -5, max: 5, step: .1 }])}>+ Add slider</button>
        </section>
        <section className="graph-calculus graph-volume-calculus" aria-label="2D and 3D numerical integration">
          <header><strong>Measure integral</strong><span>Rectangular bounds</span></header>
          <label>Integrand<ResearchMathField id="research-3d-volume-integrand" label="Double or triple integral integrand" placeholder="x y or x y z" value={volumeCalculation.integrand} onChange={(integrand) => setVolumeCalculation((current) => ({ ...current, integrand }))} /></label>
          <label>Integral type<select aria-label="Integral dimensions" value={volumeCalculation.dimensions} onChange={(event) => setVolumeCalculation((current) => ({ ...current, dimensions: Number(event.target.value) as 2 | 3 }))}><option value={2}>Double integral dx dy</option><option value={3}>Triple integral dx dy dz</option></select></label>
          <div className="graph-calculus__bounds">{(['x', 'y', ...(volumeCalculation.dimensions === 3 ? ['z'] : [])] as Array<'x' | 'y' | 'z'>).map((axis) => <span key={axis}><label>{axis} min<input type="number" step="any" value={volumeCalculation[`${axis}Min`]} onChange={(event) => setVolumeCalculation((current) => ({ ...current, [`${axis}Min`]: Number(event.target.value) }))} /></label><label>{axis} max<input type="number" step="any" value={volumeCalculation[`${axis}Max`]} onChange={(event) => setVolumeCalculation((current) => ({ ...current, [`${axis}Max`]: Number(event.target.value) }))} /></label></span>)}</div>
          <button type="button" onClick={() => {
            void (async () => {
              try {
                const parameterValues = Object.fromEntries(parameters.filter((parameter) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(parameter.name)).map((parameter) => [parameter.name, parameter.value]));
                const evaluate = await numericEvaluator(volumeCalculation.integrand, [...Object.keys(parameterValues), 'x', 'y', 'z']);
                const integrateZ = (x: number, y: number) => volumeCalculation.dimensions === 3
                  ? simpsonIntegral((z) => evaluate({ ...parameterValues, x, y, z }), volumeCalculation.zMin, volumeCalculation.zMax, 28)
                  : evaluate({ ...parameterValues, x, y });
                const value = simpsonIntegral((x) => simpsonIntegral((y) => integrateZ(x, y), volumeCalculation.yMin, volumeCalculation.yMax, 28), volumeCalculation.xMin, volumeCalculation.xMax, 28);
                if (!Number.isFinite(value)) throw new Error('The integrand is undefined inside these bounds.');
                setVolumeResult(value); setError('');
              } catch (calculationError) {
                setVolumeResult(null); setError(calculationError instanceof Error ? calculationError.message : 'The integral could not be evaluated.');
              }
            })();
          }}>Calculate numerical {volumeCalculation.dimensions === 3 ? 'triple' : 'double'} integral</button>
          {volumeResult !== null && <output><b>Checked numerical value</b> ≈ {Number(volumeResult.toPrecision(12))}</output>}
        </section>
        <section className="graph-3d-object-section" aria-label="3D points curves and parametric surfaces">
          <header><strong>Points · curves · parametric surfaces</strong><span>{points3D.length + curves3D.length + parametricSurfaces.length}</span></header>
          {points3D.map((point, index) => <div className="graph-3d-object-card" key={`point-${point.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${point.visible ? ' is-visible' : ''}`} style={{ '--graph-color': point.color } as React.CSSProperties} aria-label={`${point.visible ? 'Hide' : 'Show'} 3D point ${index + 1}`} onClick={() => setPoints3D((current) => current.map((entry) => entry.id === point.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>P{index + 1}</strong><button type="button" aria-label={`Remove 3D point ${index + 1}`} onClick={() => setPoints3D((current) => current.filter((entry) => entry.id !== point.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis} = <ResearchMathField id={`research-3d-point-${point.id}-${axis}`} label={`3D point ${index + 1} ${axis} coordinate`} value={point[axis]} onChange={(value) => setPoints3D((current) => current.map((entry) => entry.id === point.id ? { ...entry, [axis]: value } : entry))} /></label>)}</div>
          </div>)}
          {curves3D.map((curve, index) => <div className="graph-3d-object-card" key={`curve-${curve.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${curve.visible ? ' is-visible' : ''}`} style={{ '--graph-color': curve.color } as React.CSSProperties} aria-label={`${curve.visible ? 'Hide' : 'Show'} 3D curve ${index + 1}`} onClick={() => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>C{index + 1}(t)</strong><button type="button" aria-label={`Remove 3D curve ${index + 1}`} onClick={() => setCurves3D((current) => current.filter((entry) => entry.id !== curve.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis}(t) = <ResearchMathField id={`research-3d-curve-${curve.id}-${axis}`} label={`3D curve ${index + 1} ${axis} expression`} value={curve[axis]} onChange={(value) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, [axis]: value } : entry))} /></label>)}</div>
            <div className="curve-domain"><label>t min <input type="number" step="0.1" value={curve.tMin} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, tMin: Number(event.target.value) } : entry))} /></label><label>t max <input type="number" step="0.1" value={curve.tMax} onChange={(event) => setCurves3D((current) => current.map((entry) => entry.id === curve.id ? { ...entry, tMax: Number(event.target.value) } : entry))} /></label></div>
          </div>)}
          {parametricSurfaces.map((surface, index) => <div className="graph-3d-object-card" key={`parametric-surface-${surface.id}`}>
            <div className="graph-3d-object-title"><button type="button" className={`graph-color${surface.visible ? ' is-visible' : ''}`} style={{ '--graph-color': surface.color } as React.CSSProperties} aria-label={`${surface.visible ? 'Hide' : 'Show'} parametric surface ${index + 1}`} onClick={() => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, visible: !entry.visible } : entry))} /><strong>S{index + 1}(u,v)</strong><button type="button" aria-label={`Remove parametric surface ${index + 1}`} onClick={() => setParametricSurfaces((current) => current.filter((entry) => entry.id !== surface.id))}>×</button></div>
            <div className="graph-coordinate-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis}(u,v) = <ResearchMathField id={`research-3d-parametric-${surface.id}-${axis}`} label={`Parametric surface ${index + 1} ${axis} expression`} value={surface[axis]} onChange={(value) => setParametricSurfaces((current) => current.map((entry) => entry.id === surface.id ? { ...entry, [axis]: value } : entry))} /></label>)}</div>
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
        {markedIntersections.length > 0 && <section className="research-marker-list" aria-label="Saved 3D intersections"><header><strong>Marked intersections</strong><span>{markedIntersections.length}</span></header><ul>{markedIntersections.map((marker) => <li key={marker.id}><span>({marker.x.toFixed(3)}, {marker.y.toFixed(3)}, {marker.z.toFixed(3)})</span><button type="button" aria-label={`Delete 3D intersection ${marker.id}`} onClick={() => setMarkedIntersections((current) => current.filter((item) => item.id !== marker.id))}>×</button></li>)}</ul></section>}
        <p>Drag to orbit · wheel to zoom · hover to inspect · click a sampled surface crossing to mark it · restrict expressions with {'{x>-2}{x<2}'}</p>
      </aside>
      <div className="graph-stage">
        <div className="graph-controls" aria-label="3D graph view controls" ref={settingsRef}>
          <div className="graph-settings-anchor">
            <button type="button" aria-label="3D graph settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((current) => !current)}>Settings</button>
            {settingsOpen && createPortal(<section
              ref={settingsPopoverRef}
              className="graph-settings-popover graph-settings-popover--3d"
              aria-label="3D graph settings panel"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              onFocusCapture={(event) => (event.target as HTMLElement).scrollIntoView({ block: 'nearest' })}
            >
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
              <section className="graph-mesh-control" aria-label="3D mesh resolution controls">
                <header><strong>Mesh resolution</strong><output>{resolution}×{resolution}</output></header>
                <div>
                  <button type="button" aria-label="Decrease 3D mesh resolution" disabled={resolution <= 17} onClick={() => setResolution((current) => Math.max(17, current - 2))}>−</button>
                  <input aria-label="3D mesh resolution" type="range" min="17" max="45" step="2" value={resolution} onChange={(event) => setResolution(Number(event.target.value))} />
                  <input aria-label="3D mesh resolution value" type="number" min="17" max="45" step="2" value={resolution} onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setResolution(Math.max(17, Math.min(45, 17 + Math.round((value - 17) / 2) * 2)));
                  }} />
                  <button type="button" aria-label="Increase 3D mesh resolution" disabled={resolution >= 45} onClick={() => setResolution((current) => Math.min(45, current + 2))}>+</button>
                </div>
              </section>
              <div className="surface-presets" aria-label="3D camera presets"><button type="button" aria-label="3D camera Perspective preset" onClick={() => setCameraPreset('iso')}>Perspective</button><button type="button" aria-label="3D camera Top preset" onClick={() => setCameraPreset('top')}>Top</button><button type="button" aria-label="3D camera Front preset" onClick={() => setCameraPreset('front')}>Front</button><button type="button" aria-label="3D camera Side preset" onClick={() => setCameraPreset('side')}>Side</button></div>
            </section>, document.body)}
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
            const bounds = event.currentTarget.getBoundingClientRect(); const pointerX = (event.clientX - bounds.left) * event.currentTarget.width / bounds.width; const pointerY = (event.clientY - bounds.top) * event.currentTarget.height / bounds.height;
            const crossing = tracePointsRef.current.filter((point) => point.expression === 'surface intersection').map((point) => ({ point, distance: Math.hypot(point.screenX - pointerX, point.screenY - pointerY) })).sort((a, b) => a.distance - b.distance)[0];
            if (crossing && crossing.distance <= 18) { const point = crossing.point; const marker = { id: `${point.x.toPrecision(7)}-${point.y.toPrecision(7)}-${point.z.toPrecision(7)}`, x: point.x, y: point.y, z: point.z }; setMarkedIntersections((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker]); setTrace({ x: point.x, y: point.y, z: point.z, color: point.color, expression: point.expression }); return; }
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
            const deltaY = event.deltaY;
            setCamera((view) => ({ ...view, zoom: Math.max(.45, Math.min(2.6, view.zoom * Math.exp(-deltaY * .0015))) }));
          }}
        />
        {trace && <output className="graph-trace graph-trace--3d" style={{ '--graph-color': trace.color } as React.CSSProperties}>{trace.expression === 'surface intersection' ? 'Surface crossing · click to mark · ' : ''}x = {trace.x.toFixed(3)} · y = {trace.y.toFixed(3)} · z = {trace.z.toFixed(3)}</output>}
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

const GEOMETRY_MIN_SCALE = SCIENTIFIC_VIEW_MIN_SCALE;
const GEOMETRY_MAX_SCALE = SCIENTIFIC_VIEW_MAX_SCALE;

function clampGeometryScale(scale: number) {
  return Math.max(GEOMETRY_MIN_SCALE, Math.min(GEOMETRY_MAX_SCALE, scale));
}

function GeometryLab({ storagePrefix }: { storagePrefix: string }) {
  const [points, setPoints] = usePersistentResearchState<GeometryPoint[]>(`${storagePrefix}:geometry:points`, []);
  const [objects, setObjects] = usePersistentResearchState<GeometryObject[]>(`${storagePrefix}:geometry:objects`, []);
  const [tool, setTool] = useState<GeometryTool>('move');
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
  const [hoverGeometryIntersection, setHoverGeometryIntersection] = useState<GraphIntersectionMarker | null>(null);
  const [geometryIntersectionMarkers, setGeometryIntersectionMarkers] = usePersistentResearchState<GraphIntersectionMarker[]>(`${storagePrefix}:geometry:intersection-markers`, []);
  const [interactionNotice, setInteractionNotice] = useState('Move mode: drag a point, an object, or the blank paper.');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const nextPointIdRef = useRef(Math.max(0, ...points.map((point) => point.id)) + 1);
  const nextObjectIdRef = useRef(Math.max(0, ...objects.map((object) => object.id)) + 1);
  const spacePanRef = useRef(false);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    anchorWorldX: number;
    anchorWorldY: number;
  } | null>(null);
  const geometryIntersectionCandidatesRef = useRef<Array<GraphIntersectionMarker & { screenX: number; screenY: number }>>([]);
  const { animateScale: animateGeometryScale, cancelAnimation: cancelGeometryZoom } = useSmoothViewportZoom(viewport, setViewport, GEOMETRY_MIN_SCALE, GEOMETRY_MAX_SCALE);
  const dragRef = useRef<
    | { kind: 'point'; pointId: number }
    | { kind: 'object'; objectId: number; startWorld: { x: number; y: number }; points: Array<{ id: number; x: number; y: number }> }
    | { kind: 'pan'; x: number; y: number; centerX: number; centerY: number }
    | null
  >(null);

  useEffect(() => {
    try { window.localStorage.removeItem(`${storagePrefix}:geometry:tool`); } catch { /* A stale destructive tool preference must never block geometry. */ }
    const editableTarget = (target: EventTarget | null) => target instanceof HTMLElement && (
      target.matches('input, textarea, select, math-field') || target.isContentEditable
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !editableTarget(event.target)) {
        spacePanRef.current = true;
        setInteractionNotice('Temporary pan: keep Space held while dragging the paper.');
        event.preventDefault();
      }
      if (event.key === 'Escape' && (tool !== 'move' || pendingPointIds.length)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setTool('move');
        setPendingPointIds([]);
        setInteractionNotice('Move mode: drag a point, an object, or the blank paper.');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePanRef.current = false;
        if (tool === 'move') setInteractionNotice('Move mode: drag a point, an object, or the blank paper.');
      }
    };
    const resetSpace = () => { spacePanRef.current = false; };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', resetSpace);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', resetSpace);
    };
  }, [pendingPointIds.length, storagePrefix, tool]);

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
    context.fillStyle = '#ffffff';
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
        context.strokeStyle = '#e7ebed'; context.lineWidth = .8;
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
      context.strokeStyle = axis ? '#555d62' : '#c8ced1';
      context.lineWidth = axis ? 2 : 1.15;
      context.beginPath(); context.moveTo(px, 0); context.lineTo(px, canvas.height); context.stroke();
      if (showAxes && !axis) { context.fillStyle = '#4f575b'; context.fillText(formatGraphNumber(x), px, Math.max(3, Math.min(canvas.height - 15, screenY(0) + 4))); }
    }
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    for (let y = Math.ceil(worldBottom / step) * step; y <= worldTop; y += step) {
      const py = screenY(y);
      const axis = Math.abs(y) < step / 100;
      if (!showGrid && !(showAxes && axis)) continue;
      context.strokeStyle = axis ? '#555d62' : '#c8ced1';
      context.lineWidth = axis ? 2 : 1.15;
      context.beginPath(); context.moveTo(0, py); context.lineTo(canvas.width, py); context.stroke();
      if (showAxes && !axis) { context.fillStyle = '#4f575b'; context.fillText(formatGraphNumber(y), Math.max(4, Math.min(canvas.width - 48, screenX(0) + 5)), py); }
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
      context.lineWidth = selected ? 3.6 : 2.5;
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
        if (object.type === 'segment' || object.type === 'vector') drawMeasurement(formatGraphNumber(geometryDistance(first, last)), (ax + bx) / 2, (ay + by) / 2 - 11);
      } else if (object.type === 'circle') {
        const center = getPoint(object.points[0]);
        const edge = getPoint(object.points[1]);
        if (!center || !edge) continue;
        const radius = geometryDistance(center, edge);
        context.beginPath(); context.arc(screenX(center.x), screenY(center.y), radius * viewport.scale, 0, Math.PI * 2); context.fill(); context.stroke();
        drawMeasurement(`r = ${formatGraphNumber(radius)}`, screenX(center.x), screenY(center.y) - radius * viewport.scale - 12);
      } else if (object.type === 'polygon') {
        const resolved = pathTo(object.points, true);
        context.fill(); context.stroke();
        if (resolved.length) {
          const centerX = resolved.reduce((sum, point) => sum + screenX(point.x), 0) / resolved.length;
          const centerY = resolved.reduce((sum, point) => sum + screenY(point.y), 0) / resolved.length;
          drawMeasurement(`A ${formatGraphNumber(polygonArea(resolved))} · P ${formatGraphNumber(polygonPerimeter(resolved))}`, centerX, centerY);
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
      const candidates: Array<GraphIntersectionMarker & { screenX: number; screenY: number }> = [];
      const drawIntersection = (intersection: { x: number; y: number }) => {
        const candidate = { id: `${intersection.x.toPrecision(8)}-${intersection.y.toPrecision(8)}`, x: intersection.x, y: intersection.y, color: '#8e5aa4', label: 'Geometry crossing', screenX: screenX(intersection.x), screenY: screenY(intersection.y) };
        if (!candidates.some((item) => Math.hypot(item.screenX - candidate.screenX, item.screenY - candidate.screenY) < 5)) candidates.push(candidate);
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
      geometryIntersectionCandidatesRef.current = candidates;
      for (const marker of geometryIntersectionMarkers) {
        const x = screenX(marker.x); const y = screenY(marker.y);
        context.fillStyle = marker.color; context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.beginPath(); context.arc(x, y, 5.5, 0, Math.PI * 2); context.fill(); context.stroke();
        drawMeasurement(`(${formatGraphNumber(marker.x)}, ${formatGraphNumber(marker.y)})`, x, y + 15);
      }
      if (hoverGeometryIntersection) {
        context.save(); context.strokeStyle = '#3f315c'; context.lineWidth = 2; context.setLineDash([3, 2]); context.beginPath(); context.arc(screenX(hoverGeometryIntersection.x), screenY(hoverGeometryIntersection.y), 8, 0, Math.PI * 2); context.stroke(); context.restore();
      }
    } else {
      geometryIntersectionCandidatesRef.current = [];
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
      context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.stroke();
      context.fillStyle = '#292821'; context.font = 'bold 11px ui-monospace, monospace'; context.textAlign = 'left'; context.textBaseline = 'bottom';
      context.fillText(point.label, screenX(point.x) + 7, screenY(point.y) - 6);
    });
  }, [angleUnit, canvasSize.height, canvasSize.width, geometryIntersectionMarkers, hoverGeometryIntersection, hoverPoint, objects, pendingPointIds, points, selectedObjectIds, showAxes, showGrid, showIntersections, showMeasurements, showMinorGrid, viewport]);

  const pointById = (id: number) => points.find((point) => point.id === id);
  const distanceToGeometryPath = (world: { x: number; y: number }, start: GeometryPoint, end: GeometryPoint, mode: 'segment' | 'line' | 'ray') => {
    const dx = end.x - start.x; const dy = end.y - start.y;
    const denominator = dx * dx + dy * dy || 1;
    let parameter = ((world.x - start.x) * dx + (world.y - start.y) * dy) / denominator;
    if (mode === 'segment') parameter = Math.max(0, Math.min(1, parameter));
    if (mode === 'ray') parameter = Math.max(0, parameter);
    return Math.hypot(world.x - (start.x + parameter * dx), world.y - (start.y + parameter * dy));
  };
  const geometryObjectAt = (world: { x: number; y: number }, threshold = 10 / viewport.scale) => [...objects].reverse().find((object) => {
    if (object.visible === false) return false;
    const vertices = object.points.map(pointById).filter((entry): entry is GeometryPoint => Boolean(entry));
    if (object.type === 'segment' || object.type === 'vector' || object.type === 'line' || object.type === 'ray') {
      return vertices.length === 2 && distanceToGeometryPath(world, vertices[0], vertices[1], object.type === 'vector' ? 'segment' : object.type) <= threshold;
    }
    if (object.type === 'circle') {
      return vertices.length === 2 && Math.abs(geometryDistance(vertices[0], world) - geometryDistance(vertices[0], vertices[1])) <= threshold;
    }
    if (object.type === 'angle') {
      return vertices.length === 3 && (
        distanceToGeometryPath(world, vertices[1], vertices[0], 'segment') <= threshold
        || distanceToGeometryPath(world, vertices[1], vertices[2], 'segment') <= threshold
      );
    }
    if (vertices.length < 3) return false;
    const onEdge = vertices.some((vertex, index) => distanceToGeometryPath(world, vertex, vertices[(index + 1) % vertices.length], 'segment') <= threshold);
    if (onEdge) return true;
    let inside = false;
    for (let index = 0, last = vertices.length - 1; index < vertices.length; last = index, index += 1) {
      const first = vertices[index]; const previous = vertices[last];
      const crosses = (first.y > world.y) !== (previous.y > world.y)
        && world.x < (previous.x - first.x) * (world.y - first.y) / ((previous.y - first.y) || Number.EPSILON) + first.x;
      if (crosses) inside = !inside;
    }
    return inside;
  });
  const fitGeometryObjects = () => {
    if (!points.length) {
      setViewport({ centerX: 0, centerY: 0, scale: 42 });
      setInteractionNotice('View reset to the origin.');
      return;
    }
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const xMin = Math.min(...xValues); const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues); const yMax = Math.max(...yValues);
    const usableWidth = Math.max(120, canvasSize.width - 150);
    const usableHeight = Math.max(120, canvasSize.height - 150);
    const xRange = Math.max(xMax - xMin, 2);
    const yRange = Math.max(yMax - yMin, 2);
    setViewport({
      centerX: (xMin + xMax) / 2,
      centerY: (yMin + yMax) / 2,
      scale: clampGeometryScale(Math.min(usableWidth / xRange, usableHeight / yRange)),
    });
    setInteractionNotice(`Fit ${points.length} point${points.length === 1 ? '' : 's'} in view without changing the construction.`);
  };
  const objectDescription = (object: GeometryObject) => {
    const labels = object.points.map((id) => pointById(id)?.label ?? '?').join('');
    if (object.type === 'segment' || object.type === 'vector') {
      const first = pointById(object.points[0]); const last = pointById(object.points[1]);
      return `${object.type === 'vector' ? 'Vector' : 'Segment'} ${labels}${first && last ? ` · ${formatGraphNumber(geometryDistance(first, last))}` : ''}`;
    }
    if (object.type === 'circle') {
      const center = pointById(object.points[0]); const edge = pointById(object.points[1]);
      return `Circle ${labels}${center && edge ? ` · r ${formatGraphNumber(geometryDistance(center, edge))}` : ''}`;
    }
    if (object.type === 'polygon') {
      const vertices = object.points.map(pointById).filter((point): point is GeometryPoint => Boolean(point));
      return `Polygon ${labels} · area ${formatGraphNumber(polygonArea(vertices))}`;
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
    const command = constructionCommand
      .replace(/\\left|\\right/g, '')
      .replace(/\\(?:operatorname|mathrm)\{([^{}]+)\}/g, '$1')
      .replace(/\\cdot/g, '*')
      .replace(/[{}]/g, (character) => character === '{' ? '(' : ')')
      .replace(/\\([a-z]+)/gi, '$1')
      .replace(/\s+/g, '')
      .trim();
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
    if (!insertIntoMathfield('research-geometry-command', token)) {
      setConstructionCommand((current) => `${current}${token}`);
    }
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
          <label>New expression<ResearchMathField id="research-geometry-command" label="Geometry construction expression" placeholder="circle(A,3)" value={constructionCommand} onChange={setConstructionCommand} onEnter={executeConstructionCommand} /></label>
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
            <button type="button" className="geometry-expression-select" aria-pressed={selectedObjectIds.includes(object.id)} onClick={(event) => setSelectedObjectIds((current) => event.shiftKey ? (current.includes(object.id) ? current.filter((id) => id !== object.id) : [...current, object.id]) : [object.id])}><b>{index + 1}</b><ScientificMath latex={`\\operatorname{${object.type}}\\left(${objectExpression(object).replace(/^[^(]+\(|\)$/g, '')}\\right)`} label={`Geometry ${object.type} ${index + 1}`} /><small>{objectDescription(object)}</small></button>
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
            <div><label>center x<input type="number" step="any" aria-label="Selected circle center x" disabled={Boolean(selectedCircleCenter.constraint)} value={selectedCircleCenter.x} onChange={(event) => setPoints((current) => current.map((point) => point.id === selectedCircleCenter.id ? { ...point, x: Number(event.target.value) } : point))} /></label><label>center y<input type="number" step="any" aria-label="Selected circle center y" disabled={Boolean(selectedCircleCenter.constraint)} value={selectedCircleCenter.y} onChange={(event) => setPoints((current) => current.map((point) => point.id === selectedCircleCenter.id ? { ...point, y: Number(event.target.value) } : point))} /></label></div>
            <label>radius<input type="number" min="0.000000001" step="any" aria-label="Selected circle radius" disabled={radiusComesFromCompass} value={selectedCircleRadius} onChange={(event) => updateSelectedCircleRadius(Number(event.target.value))} /></label>
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
          {points.map((point) => <div key={point.id} title={point.constraint ? `Constrained: ${point.constraint.type}` : 'Free point'}><b>{point.label}{point.constraint ? '◇' : ''}</b><label>x <input type="number" step="any" disabled={Boolean(point.constraint)} aria-label={`Point ${point.label} x coordinate`} value={point.x} onChange={(event) => setPoints((current) => current.map((entry) => entry.id === point.id ? { ...entry, x: Number(event.target.value) } : entry))} /></label><label>y <input type="number" step="any" disabled={Boolean(point.constraint)} aria-label={`Point ${point.label} y coordinate`} value={point.y} onChange={(event) => setPoints((current) => current.map((entry) => entry.id === point.id ? { ...entry, y: Number(event.target.value) } : entry))} /></label></div>)}
        </div>
        {geometryIntersectionMarkers.length > 0 && <section className="research-marker-list" aria-label="Saved geometry intersections"><header><strong>Marked intersections</strong><span>{geometryIntersectionMarkers.length}</span></header><ul>{geometryIntersectionMarkers.map((marker) => <li key={marker.id}><span>({formatGraphNumber(marker.x)}, {formatGraphNumber(marker.y)})</span><button type="button" aria-label={`Delete geometry intersection ${marker.id}`} onClick={() => setGeometryIntersectionMarkers((current) => current.filter((item) => item.id !== marker.id))}>×</button></li>)}</ul></section>}
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
          {GEOMETRY_TOOLS.map((entry) => <button type="button" key={entry.id} className={tool === entry.id ? 'is-active' : ''} aria-label={entry.label} aria-pressed={tool === entry.id} onClick={() => {
            setTool(entry.id);
            setPendingPointIds([]);
            setInteractionNotice(entry.id === 'move'
              ? 'Move mode: drag a point, an object, or the blank paper.'
              : entry.id === 'delete'
                ? 'Delete mode: click an item to remove it. Press Escape to return safely to Move.'
                : `${entry.label}. Hold Space while dragging to pan without leaving this tool.`);
          }}><span>{entry.symbol}</span><span>{entry.label.replace(/ and .*/, '').replace(/Construct /, '').replace(/Add /, '')}</span></button>)}
        </div>
        <div className="graph-controls" aria-label="Geometry view controls">
          <button type="button" aria-label="Zoom geometry in" disabled={lockViewport} onClick={() => animateGeometryScale(2)}>+</button>
          <button type="button" aria-label="Zoom geometry out" disabled={lockViewport} onClick={() => animateGeometryScale(.5)}>−</button>
          <button type="button" className="geometry-view-action" aria-label="Show geometry plus or minus 10^5 range" disabled={lockViewport} onClick={() => { cancelGeometryZoom(); setViewport({ centerX: 0, centerY: 0, scale: scientificOverviewScale(canvasSize.width, canvasSize.height) }); }}>±10⁵</button>
          <button type="button" className="geometry-view-action" aria-label="Show geometry 10^-5 detail" disabled={lockViewport} onClick={() => { cancelGeometryZoom(); setViewport((current) => ({ ...current, scale: clampGeometryScale(64 / SCIENTIFIC_DETAIL_STEP) })); }}>10⁻⁵</button>
          <button type="button" className="geometry-view-action" aria-label="Fit all geometry objects" onClick={fitGeometryObjects}>Fit</button>
          <button type="button" className="geometry-view-action" aria-label="Reset geometry view" onClick={() => { setViewport({ centerX: 0, centerY: 0, scale: 42 }); setInteractionNotice('View reset to the origin without changing the construction.'); }}>Reset</button>
        </div>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          aria-label="Interactive geometry canvas"
          data-tool={tool}
          data-viewport-scale={viewport.scale}
          onPointerDown={(event) => {
            const canvas = event.currentTarget;
            const bounds = canvas.getBoundingClientRect();
            const pixelX = (event.clientX - bounds.left) * canvas.width / bounds.width;
            const pixelY = (event.clientY - bounds.top) * canvas.height / bounds.height;
            if (event.pointerType === 'touch') {
              touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              canvas.setPointerCapture(event.pointerId);
              if (touchPointersRef.current.size >= 2) {
                const [first, last] = [...touchPointersRef.current.values()];
                const midpointX = (first.x + last.x) / 2;
                const midpointY = (first.y + last.y) / 2;
                const midpointPixelX = (midpointX - bounds.left) * canvas.width / bounds.width;
                const midpointPixelY = (midpointY - bounds.top) * canvas.height / bounds.height;
                pinchRef.current = {
                  distance: Math.max(1, Math.hypot(last.x - first.x, last.y - first.y)),
                  scale: viewport.scale,
                  anchorWorldX: viewport.centerX + (midpointPixelX - canvas.width / 2) / viewport.scale,
                  anchorWorldY: viewport.centerY - (midpointPixelY - canvas.height / 2) / viewport.scale,
                };
                dragRef.current = null;
                setInteractionNotice('Pinch zoom keeps the construction anchored between your fingers.');
                return;
              }
            }
            const world = {
              x: viewport.centerX + (pixelX - canvas.width / 2) / viewport.scale,
              y: viewport.centerY - (pixelY - canvas.height / 2) / viewport.scale,
            };
            const crossing = geometryIntersectionCandidatesRef.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.screenX - pixelX, candidate.screenY - pixelY) })).sort((a, b) => a.distance - b.distance)[0];
            if (showIntersections && crossing && crossing.distance <= 15) {
              const marker: GraphIntersectionMarker = { id: crossing.candidate.id, x: crossing.candidate.x, y: crossing.candidate.y, color: crossing.candidate.color, label: crossing.candidate.label };
              setGeometryIntersectionMarkers((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker]); setHoverGeometryIntersection(marker); setInteractionNotice(`Marked intersection (${formatGraphNumber(marker.x)}, ${formatGraphNumber(marker.y)}).`); return;
            }
            const snapStep = Math.max(Number.EPSILON, gridStep(viewport.scale) / 4);
            const snapped = snap ? { x: Math.round(world.x / snapStep) * snapStep, y: Math.round(world.y / snapStep) * snapStep } : world;
            const hit = points.find((point) => Math.hypot((point.x - world.x) * viewport.scale, (point.y - world.y) * viewport.scale) <= 10);
            const temporaryMove = tool === 'move' || spacePanRef.current || event.button === 1 || event.altKey || event.metaKey;
            if (temporaryMove) {
              const hitObject = hit ? undefined : geometryObjectAt(world);
              if (hit?.constraint && hit.constraint.type !== 'radius-edge') {
                setInteractionNotice(`Point ${hit.label} is constrained by ${hit.constraint.type}. Drag its free source point${hit.constraint.type === 'midpoint' ? 's' : ''} instead.`);
                if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                return;
              }
              if (lockViewport && !hit && !hitObject) {
                setInteractionNotice('The viewport is locked. Unlock it in Graph paper settings to pan.');
                if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                return;
              }
              canvas.setPointerCapture(event.pointerId);
              if (hit) {
                dragRef.current = { kind: 'point', pointId: hit.id };
                setInteractionNotice(hit.constraint?.type === 'radius-edge' ? `Drag ${hit.label} to set the circle radius and direction.` : `Dragging free point ${hit.label}.`);
              } else if (hitObject) {
                const movablePoints = [...new Set(hitObject.points)]
                  .map(pointById)
                  .filter((point): point is GeometryPoint => point !== undefined && !point.constraint)
                  .map((point) => ({ id: point.id, x: point.x, y: point.y }));
                if (!movablePoints.length) {
                  setInteractionNotice(`This ${hitObject.type} is fully constrained. Move its free source construction instead.`);
                  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                  return;
                }
                setSelectedObjectIds([hitObject.id]);
                dragRef.current = { kind: 'object', objectId: hitObject.id, startWorld: world, points: movablePoints };
                setInteractionNotice(`Dragging ${objectDescription(hitObject)} by its free source points.`);
              } else {
                dragRef.current = { kind: 'pan', x: event.clientX, y: event.clientY, centerX: viewport.centerX, centerY: viewport.centerY };
                setInteractionNotice('Panning the paper. The construction stays unchanged.');
              }
              return;
            }
            if (tool === 'delete') {
              if (hit) { deletePoint(hit.id); return; }
              const hitObject = geometryObjectAt(world);
              if (hitObject) {
                setObjects((current) => current.filter((object) => object.id !== hitObject.id));
                setSelectedObjectIds((current) => current.filter((id) => id !== hitObject.id));
                setInteractionNotice(`${objectDescription(hitObject)} deleted. Press Escape to return to Move.`);
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
            if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
              touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            }
            if (pinchRef.current && touchPointersRef.current.size >= 2) {
              const pinch = pinchRef.current;
              const [first, last] = [...touchPointersRef.current.values()];
              const distance = Math.max(1, Math.hypot(last.x - first.x, last.y - first.y));
              const midpointX = (first.x + last.x) / 2;
              const midpointY = (first.y + last.y) / 2;
              const midpointPixelX = (midpointX - bounds.left) * ratioX;
              const midpointPixelY = (midpointY - bounds.top) * ratioY;
              const scale = clampGeometryScale(pinch.scale * distance / pinch.distance);
              setViewport({
                centerX: pinch.anchorWorldX - (midpointPixelX - canvas.width / 2) / scale,
                centerY: pinch.anchorWorldY + (midpointPixelY - canvas.height / 2) / scale,
                scale,
              });
              return;
            }
            if (dragRef.current?.kind === 'point') {
              const world = {
                x: viewport.centerX + ((event.clientX - bounds.left) * ratioX - canvas.width / 2) / viewport.scale,
                y: viewport.centerY - ((event.clientY - bounds.top) * ratioY - canvas.height / 2) / viewport.scale,
              };
              const snapStep = Math.max(Number.EPSILON, gridStep(viewport.scale) / 4);
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
            if (dragRef.current?.kind === 'object') {
              const drag = dragRef.current;
              const world = {
                x: viewport.centerX + ((event.clientX - bounds.left) * ratioX - canvas.width / 2) / viewport.scale,
                y: viewport.centerY - ((event.clientY - bounds.top) * ratioY - canvas.height / 2) / viewport.scale,
              };
              const snapStep = Math.max(Number.EPSILON, gridStep(viewport.scale) / 4);
              const rawDx = world.x - drag.startWorld.x;
              const rawDy = world.y - drag.startWorld.y;
              const dx = snap ? Math.round(rawDx / snapStep) * snapStep : rawDx;
              const dy = snap ? Math.round(rawDy / snapStep) * snapStep : rawDy;
              const initial = new Map(drag.points.map((point) => [point.id, point]));
              setPoints((current) => current.map((point) => {
                const start = initial.get(point.id);
                return start ? { ...point, x: start.x + dx, y: start.y + dy } : point;
              }));
              return;
            }
            if (dragRef.current?.kind === 'pan') {
              const drag = dragRef.current;
              setViewport((view) => ({ ...view, centerX: drag.centerX - (event.clientX - drag.x) * ratioX / view.scale, centerY: drag.centerY + (event.clientY - drag.y) * ratioY / view.scale }));
              return;
            }
            const pixelX = (event.clientX - bounds.left) * ratioX; const pixelY = (event.clientY - bounds.top) * ratioY;
            const crossing = geometryIntersectionCandidatesRef.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.screenX - pixelX, candidate.screenY - pixelY) })).sort((a, b) => a.distance - b.distance)[0];
            if (showIntersections && crossing && crossing.distance <= 15) { setHoverGeometryIntersection(crossing.candidate); setHoverPoint({ x: crossing.candidate.x, y: crossing.candidate.y }); return; }
            setHoverGeometryIntersection(null);
            setHoverPoint({
              x: viewport.centerX + (pixelX - canvas.width / 2) / viewport.scale,
              y: viewport.centerY - (pixelY - canvas.height / 2) / viewport.scale,
            });
          }}
          onPointerUp={(event) => {
            const completedDrag = dragRef.current;
            dragRef.current = null;
            touchPointersRef.current.delete(event.pointerId);
            if (touchPointersRef.current.size < 2) pinchRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (tool === 'move' && completedDrag) setInteractionNotice('Move mode: drag a point, an object, or the blank paper.');
          }}
          onPointerCancel={(event) => {
            dragRef.current = null;
            touchPointersRef.current.delete(event.pointerId);
            if (touchPointersRef.current.size < 2) pinchRef.current = null;
          }}
          onLostPointerCapture={(event) => {
            touchPointersRef.current.delete(event.pointerId);
            if (touchPointersRef.current.size < 2) pinchRef.current = null;
          }}
          onPointerLeave={() => { if (!dragRef.current) { setHoverPoint(null); setHoverGeometryIntersection(null); } }}
          onWheel={(event) => {
            event.preventDefault();
            if (lockViewport) return;
            const canvas = event.currentTarget;
            const bounds = canvas.getBoundingClientRect();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const deltaY = event.deltaY;
            const px = (event.clientX - bounds.left) * canvasWidth / bounds.width;
            const py = (event.clientY - bounds.top) * canvasHeight / bounds.height;
            setViewport((view) => {
              const worldX = view.centerX + (px - canvasWidth / 2) / view.scale;
              const worldY = view.centerY - (py - canvasHeight / 2) / view.scale;
              const scale = clampGeometryScale(view.scale * Math.exp(-deltaY * .0015));
              return { centerX: worldX - (px - canvasWidth / 2) / scale, centerY: worldY + (py - canvasHeight / 2) / scale, scale };
            });
          }}
        />
        {hoverPoint && <output className="geometry-coordinates">{hoverGeometryIntersection ? 'Intersection · click to mark · ' : ''}x = {formatGraphNumber(hoverPoint.x)} · y = {formatGraphNumber(hoverPoint.y)}</output>}
        <output className="geometry-interaction-notice" aria-live="polite">{interactionNotice}</output>
      </div>
    </section>
  );
}

interface Geometry3DPoint { id: number; label: string; x: number; y: number; z: number; color: string; visible: boolean }
type Geometry3DObject =
  | { id: number; type: 'segment' | 'vector'; points: [number, number]; color: string; visible: boolean; label: string }
  | { id: number; type: 'triangle'; points: [number, number, number]; color: string; visible: boolean; label: string }
  | { id: number; type: 'sphere'; center: number; radius: number; color: string; visible: boolean; label: string }
  | { id: number; type: 'solid'; primitive: Geometry3DPrimitive; center: number; dimensions: [number, number, number]; color: string; visible: boolean; label: string };

const GEOMETRY_3D_OBJECTS: ReadonlyArray<{ primitive: Geometry3DPrimitive; label: string; dimensions: [number, number, number] }> = [
  { primitive: 'cube', label: 'Cube', dimensions: [2, 2, 2] },
  { primitive: 'cuboid', label: 'Cuboid', dimensions: [3, 2, 2] },
  { primitive: 'tetrahedron', label: 'Tetrahedron', dimensions: [2.5, 2.5, 2.5] },
  { primitive: 'octahedron', label: 'Octahedron', dimensions: [3, 3, 3] },
  { primitive: 'sphere', label: 'Sphere', dimensions: [1.5, 1.5, 1.5] },
  { primitive: 'ellipsoid', label: 'Ellipsoid', dimensions: [2, 1.35, 1] },
  { primitive: 'cylinder', label: 'Cylinder', dimensions: [1.25, 1.25, 3] },
  { primitive: 'cone', label: 'Cone', dimensions: [1.5, 1.5, 3] },
  { primitive: 'paraboloid', label: 'Paraboloid', dimensions: [1.6, 1.6, 3] },
];

function segmentIntersection3D(a: Geometry3DPoint, b: Geometry3DPoint, c: Geometry3DPoint, d: Geometry3DPoint): { x: number; y: number; z: number } | null {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const v = { x: d.x - c.x, y: d.y - c.y, z: d.z - c.z }; const w = { x: a.x - c.x, y: a.y - c.y, z: a.z - c.z };
  const dot = (p: typeof u, q: typeof u) => p.x * q.x + p.y * q.y + p.z * q.z;
  const uu = dot(u, u); const uv = dot(u, v); const vv = dot(v, v); const uw = dot(u, w); const vw = dot(v, w); const denominator = uu * vv - uv * uv;
  if (Math.abs(denominator) < 1e-10) return null;
  const s = (uv * vw - vv * uw) / denominator; const t = (uu * vw - uv * uw) / denominator;
  if (s < -1e-6 || s > 1 + 1e-6 || t < -1e-6 || t > 1 + 1e-6) return null;
  const first = { x: a.x + s * u.x, y: a.y + s * u.y, z: a.z + s * u.z }; const second = { x: c.x + t * v.x, y: c.y + t * v.y, z: c.z + t * v.z };
  if (Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z) > 1e-3) return null;
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, z: (first.z + second.z) / 2 };
}

function Geometry3DLab({ storagePrefix }: { storagePrefix: string }) {
  const [points, setPoints] = usePersistentResearchState<Geometry3DPoint[]>(`${storagePrefix}:geometry3d:points`, []);
  const [objects, setObjects] = usePersistentResearchState<Geometry3DObject[]>(`${storagePrefix}:geometry3d:objects`, []);
  const [camera, setCamera] = usePersistentResearchState(`${storagePrefix}:geometry3d:camera`, { yaw: -.72, pitch: -.52, zoom: 1, panX: 0, panY: 0 });
  const [command, setCommand] = useState('');
  const [message, setMessage] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedObject, setSelectedObject] = useState<number | null>(null);
  const [hoverIntersection, setHoverIntersection] = useState<{ id: string; x: number; y: number; z: number } | null>(null);
  const [intersectionMarkers, setIntersectionMarkers] = usePersistentResearchState<Array<{ id: string; x: number; y: number; z: number }>>(`${storagePrefix}:geometry3d:intersection-markers`, []);
  const [moveAxis, setMoveAxis] = useState<'screen' | 'x' | 'y' | 'z'>('screen');
  const [transform, setTransform] = useState({ dx: 1, dy: 0, dz: 0, angle: 30, scale: 2, axis: 'x' as 'x' | 'y' | 'z' });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSize = useResponsiveCanvasSize(canvasRef);
  const drag = useRef<{ pointerId: number; x: number; y: number; yaw: number; pitch: number; panX: number; panY: number; pan: boolean; point?: Geometry3DPoint } | null>(null);
  const projectedPoints = useRef<Array<{ id: number; sx: number; sy: number }>>([]);
  const projectedIntersections = useRef<Array<{ id: string; x: number; y: number; z: number; sx: number; sy: number }>>([]);

  const pointById = (id: number) => points.find((point) => point.id === id);
  const nextPointId = () => Math.max(0, ...points.map((point) => point.id)) + 1;
  const nextObjectId = () => Math.max(0, ...objects.map((object) => object.id)) + 1;
  const nextPointLabel = () => {
    const used = new Set(points.map((point) => point.label));
    for (let index = 0; index < 702; index += 1) {
      const label = geometryPointLabel(index);
      if (!used.has(label)) return label;
    }
    return `P${nextPointId()}`;
  };

  const objectUsesPoint = (object: Geometry3DObject, pointId: number) => (
    object.type === 'sphere' || object.type === 'solid'
      ? object.center === pointId
      : object.points.includes(pointId)
  );

  function deletePoint(pointId: number) {
    const target = pointById(pointId);
    if (!target) return;
    const dependent = objects.filter((object) => objectUsesPoint(object, pointId));
    if (dependent.length && !window.confirm(`Delete point ${target.label} and ${dependent.length} dependent 3D object${dependent.length === 1 ? '' : 's'}?`)) return;
    setObjects((current) => current.filter((object) => !objectUsesPoint(object, pointId)));
    setPoints((current) => current.filter((point) => point.id !== pointId));
    if (selectedPoint === pointId) setSelectedPoint(null);
    if (selectedObject && dependent.some((object) => object.id === selectedObject)) setSelectedObject(null);
    setMessage(`Point ${target.label} deleted${dependent.length ? ` with ${dependent.length} dependent object${dependent.length === 1 ? '' : 's'}` : ''}.`);
  }

  function startConstruction(template: string) {
    setCommand('');
    requestAnimationFrame(() => insertIntoMathfield('research-geometry3d-command', template));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fffefa'; context.fillRect(0, 0, canvas.width, canvas.height);
    const cy = Math.cos(camera.yaw); const sy = Math.sin(camera.yaw);
    const cp = Math.cos(camera.pitch); const sp = Math.sin(camera.pitch);
    const scale = Math.min(canvas.width, canvas.height) * .075 * camera.zoom;
    const project = (x: number, y: number, z: number) => {
      const rx = x * cy - y * sy;
      const ry = x * sy + y * cy;
      const rz = z * cp - ry * sp;
      const depth = z * sp + ry * cp;
      const perspective = 1 / Math.max(.45, 1 + depth * .035);
      return { x: canvas.width / 2 + (camera.panX ?? 0) + rx * scale * perspective, y: canvas.height / 2 + (camera.panY ?? 0) - rz * scale * perspective, depth, perspective };
    };
    const line = (a: { x: number; y: number }, b: { x: number; y: number }, color: string, width = 1.5) => {
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.strokeStyle = color; context.lineWidth = width; context.stroke();
    };
    for (const [axis, color] of [[{ x: 6, y: 0, z: 0 }, '#b84d42'], [{ x: 0, y: 6, z: 0 }, '#4e8b55'], [{ x: 0, y: 0, z: 6 }, '#4779ad']] as const) {
      line(project(0, 0, 0), project(axis.x, axis.y, axis.z), color, 2);
    }
    const visibleObjects = objects.filter((object) => object.visible).map((object) => ({ object, depth: object.type === 'sphere' || object.type === 'solid' ? pointById(object.center)?.z ?? 0 : object.points.map((id) => pointById(id)?.z ?? 0).reduce((a, b) => a + b, 0) })).sort((a, b) => a.depth - b.depth);
    for (const { object } of visibleObjects) {
      context.strokeStyle = object.color; context.fillStyle = `${object.color}28`; context.lineWidth = selectedObject === object.id ? 4 : 2;
      if (object.type === 'sphere') {
        const center = pointById(object.center); if (!center) continue;
        const wireframe = createGeometry3DWireframe('sphere', [object.radius, object.radius, object.radius]);
        wireframe.paths.forEach((path) => {
          const projected = path.map((value) => project(center.x + value.x, center.y + value.y, center.z + value.z));
          context.beginPath(); context.moveTo(projected[0].x, projected[0].y);
          projected.slice(1).forEach((value) => context.lineTo(value.x, value.y));
          context.strokeStyle = object.color; context.lineWidth = selectedObject === object.id ? 3 : 1.7; context.stroke();
        });
        continue;
      }
      if (object.type === 'solid') {
        const center = pointById(object.center); if (!center) continue;
        const wireframe = createGeometry3DWireframe(object.primitive, object.dimensions);
        const offset = (value: { x: number; y: number; z: number }) => project(center.x + value.x, center.y + value.y, center.z + value.z);
        if (wireframe.faces.length) {
          wireframe.faces
            .map((face) => ({ points: face.map(offset), depth: face.map((value) => value.z + center.z).reduce((sum, value) => sum + value, 0) / face.length }))
            .sort((a, b) => a.depth - b.depth)
            .forEach((face) => {
              context.beginPath(); context.moveTo(face.points[0].x, face.points[0].y);
              face.points.slice(1).forEach((value) => context.lineTo(value.x, value.y));
              context.closePath(); context.fillStyle = `${object.color}18`; context.fill();
            });
        }
        wireframe.paths.forEach((path) => {
          const projected = path.map(offset); if (projected.length < 2) return;
          context.beginPath(); context.moveTo(projected[0].x, projected[0].y);
          projected.slice(1).forEach((value) => context.lineTo(value.x, value.y));
          context.strokeStyle = object.color; context.lineWidth = selectedObject === object.id ? 3 : 1.7; context.stroke();
        });
        continue;
      }
      const vertices = object.points.map(pointById).filter((point): point is Geometry3DPoint => Boolean(point)).map((point) => project(point.x, point.y, point.z));
      if (vertices.length < 2) continue;
      context.beginPath(); context.moveTo(vertices[0].x, vertices[0].y);
      vertices.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      if (object.type === 'triangle') { context.closePath(); context.fill(); }
      context.stroke();
      if (object.type === 'vector') {
        const a = vertices[vertices.length - 2]; const b = vertices[vertices.length - 1]; const angle = Math.atan2(b.y - a.y, b.x - a.x);
        context.beginPath(); context.moveTo(b.x, b.y); context.lineTo(b.x - 12 * Math.cos(angle - .45), b.y - 12 * Math.sin(angle - .45)); context.lineTo(b.x - 12 * Math.cos(angle + .45), b.y - 12 * Math.sin(angle + .45)); context.closePath(); context.fillStyle = object.color; context.fill();
      }
    }
    projectedPoints.current = [];
    const edges: Array<[Geometry3DPoint, Geometry3DPoint]> = [];
    objects.filter((object): object is Extract<Geometry3DObject, { type: 'segment' | 'vector' | 'triangle' }> => object.visible && object.type !== 'sphere' && object.type !== 'solid').forEach((object) => {
      const vertices = object.points.map(pointById).filter((point): point is Geometry3DPoint => Boolean(point));
      if (vertices.length === 2) edges.push([vertices[0], vertices[1]]);
      if (vertices.length === 3) edges.push([vertices[0], vertices[1]], [vertices[1], vertices[2]], [vertices[2], vertices[0]]);
    });
    const candidates: typeof projectedIntersections.current = [];
    for (let first = 0; first < edges.length; first += 1) for (let second = first + 1; second < edges.length; second += 1) {
      if (edges[first].some((point) => edges[second].some((other) => other.id === point.id))) continue;
      const intersection = segmentIntersection3D(...edges[first], ...edges[second]); if (!intersection) continue;
      const projected = project(intersection.x, intersection.y, intersection.z); const candidate = { id: `${intersection.x.toPrecision(8)}-${intersection.y.toPrecision(8)}-${intersection.z.toPrecision(8)}`, ...intersection, sx: projected.x, sy: projected.y };
      if (!candidates.some((item) => Math.hypot(item.sx - candidate.sx, item.sy - candidate.sy) < 6)) candidates.push(candidate);
    }
    projectedIntersections.current = candidates;
    intersectionMarkers.forEach((marker) => { const projected = project(marker.x, marker.y, marker.z); context.beginPath(); context.arc(projected.x, projected.y, 6, 0, Math.PI * 2); context.fillStyle = '#8e5aa4'; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke(); context.fillStyle = '#3f315c'; context.font = 'bold 9px ui-monospace, monospace'; context.fillText(`(${marker.x.toFixed(2)}, ${marker.y.toFixed(2)}, ${marker.z.toFixed(2)})`, projected.x + 8, projected.y - 8); });
    if (hoverIntersection) { const projected = project(hoverIntersection.x, hoverIntersection.y, hoverIntersection.z); context.save(); context.strokeStyle = '#3f315c'; context.lineWidth = 2; context.setLineDash([3, 2]); context.beginPath(); context.arc(projected.x, projected.y, 9, 0, Math.PI * 2); context.stroke(); context.restore(); }
    points.filter((point) => point.visible).forEach((point) => {
      const projected = project(point.x, point.y, point.z);
      projectedPoints.current.push({ id: point.id, sx: projected.x, sy: projected.y });
      context.beginPath(); context.arc(projected.x, projected.y, selectedPoint === point.id ? 7 : 5, 0, Math.PI * 2); context.fillStyle = point.color; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke();
      context.fillStyle = '#332f2a'; context.font = '600 13px system-ui'; context.fillText(point.label, projected.x + 8, projected.y - 8);
    });
  }, [camera, canvasSize.height, canvasSize.width, hoverIntersection, intersectionMarkers, objects, points, selectedObject, selectedPoint]);

  function addPrimitive(
    primitive: Geometry3DPrimitive,
    dimensions: [number, number, number],
    existingCenter?: Geometry3DPoint,
  ) {
    const centerId = existingCenter?.id ?? nextPointId();
    const center = existingCenter ?? {
      id: centerId,
      label: nextPointLabel(),
      x: ((objects.length % 3) - 1) * 2.5,
      y: Math.floor(objects.length / 3) % 2 ? 1.5 : 0,
      z: 0,
      color: GRAPH_COLORS[points.length % GRAPH_COLORS.length],
      visible: true,
    };
    if (!existingCenter) setPoints((current) => [...current, center]);
    const id = nextObjectId();
    const color = GRAPH_COLORS[objects.length % GRAPH_COLORS.length];
    setObjects((current) => [...current, {
      id,
      type: 'solid',
      primitive,
      center: centerId,
      dimensions,
      color,
      visible: true,
      label: `${primitive}(${center.label})`,
    }]);
    setSelectedObject(id); setSelectedPoint(null); setCommand('');
    setMessage(`${primitive[0].toUpperCase()}${primitive.slice(1)} created. Drag its center point to move it.`);
  }

  function runCommand() {
    // Older starter options accidentally supplied doubled backslashes through
    // JSX string attributes. Collapse those before interpreting the MathLive
    // LaTeX so an in-progress command remains recoverable after an update.
    const visibleCommand = getMathfieldValue('research-geometry3d-command') ?? command;
    const source = visibleCommand.replace(/\\\\/g, '\\').replace(/\\operatorname\{\\mathrm\{([^{}]+)\}\}/g, '$1').replace(/\\left|\\right/g, '').replace(/\\(?:operatorname|mathrm)\{([^{}]+)\}/g, '$1').replace(/[{}]/g, (c) => c === '{' ? '(' : ')').replace(/\\([a-z]+)/gi, '$1').replace(/\s+/g, '');
    const match = source.match(/^([a-z]+)\((.*)\)$/i);
    if (!match) { setMessage('Use point, segment, vector, triangle, midpoint, or a 3D object command such as cube(A,2) or ellipsoid(A,2,1,1).'); return; }
    const operation = match[1].toLowerCase(); const args = match[2].split(',');
    const byLabel = (label: string) => points.find((point) => point.label.toLowerCase() === label.toLowerCase());
    if (operation === 'point' && args.length === 3 && args.every((value) => Number.isFinite(Number(value)))) {
      const id = nextPointId(); const label = nextPointLabel();
      setPoints((current) => [...current, { id, label, x: Number(args[0]), y: Number(args[1]), z: Number(args[2]), color: GRAPH_COLORS[current.length % GRAPH_COLORS.length], visible: true }]); setSelectedPoint(id); setCommand(''); setMessage('Point created.'); return;
    }
    if (operation === 'midpoint' && args.length === 2) {
      const a = byLabel(args[0]); const b = byLabel(args[1]); if (!a || !b) { setMessage('Create both named points first.'); return; }
      const id = nextPointId(); setPoints((current) => [...current, { id, label: nextPointLabel(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, color: GRAPH_COLORS[current.length % GRAPH_COLORS.length], visible: true }]); setSelectedPoint(id); setCommand(''); setMessage('Midpoint created.'); return;
    }
    const solidOperation = operation as Geometry3DPrimitive;
    if (['cube', 'tetrahedron', 'octahedron', 'sphere'].includes(solidOperation) && args.length === 2) {
      const center = byLabel(args[0]); const size = Number(args[1]);
      if (!center || !(size > 0)) { setMessage(`${operation} needs an existing center point and a positive size.`); return; }
      addPrimitive(solidOperation, [size, size, size], center); return;
    }
    if (['cylinder', 'cone', 'paraboloid'].includes(solidOperation) && args.length === 3) {
      const center = byLabel(args[0]); const radius = Number(args[1]); const height = Number(args[2]);
      if (!center || !(radius > 0) || !(height > 0)) { setMessage(`${operation} needs an existing center, positive radius, and positive height.`); return; }
      addPrimitive(solidOperation, [radius, radius, height], center); return;
    }
    if (['cuboid', 'ellipsoid'].includes(solidOperation) && args.length === 4) {
      const center = byLabel(args[0]); const dimensions = args.slice(1).map(Number) as [number, number, number];
      if (!center || dimensions.some((value) => !(value > 0))) { setMessage(`${operation} needs an existing center and three positive dimensions.`); return; }
      addPrimitive(solidOperation, dimensions, center); return;
    }
    const required = operation === 'triangle' ? 3 : 2; const resolved = args.map(byLabel);
    if (!['segment', 'vector', 'triangle'].includes(operation) || args.length !== required || resolved.some((point) => !point)) { setMessage('Check the construction name, point labels, and number of arguments.'); return; }
    const id = nextObjectId(); const pointIds = resolved.map((point) => point!.id);
    setObjects((current) => [...current, { id, type: operation, points: pointIds, color: GRAPH_COLORS[current.length % GRAPH_COLORS.length], visible: true, label: `${operation}(${args.join(',')})` } as Geometry3DObject]); setSelectedObject(id); setCommand(''); setMessage(`${operation} created.`);
  }

  const selected = objects.find((object) => object.id === selectedObject);
  const measurement = selected ? (() => {
    if (selected.type === 'sphere') return `radius ${selected.radius.toPrecision(4)} · volume ${(4 / 3 * Math.PI * selected.radius ** 3).toPrecision(5)}`;
    if (selected.type === 'solid') return geometry3DPrimitiveMeasurement(selected.primitive, selected.dimensions);
    const vertices = selected.points.map(pointById).filter((point): point is Geometry3DPoint => Boolean(point));
    const distance = (a: Geometry3DPoint, b: Geometry3DPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (vertices.length === 2) return `${selected.type === 'vector' ? 'magnitude' : 'length'} ${distance(vertices[0], vertices[1]).toPrecision(5)}`;
    if (vertices.length === 3) {
      const ab = { x: vertices[1].x - vertices[0].x, y: vertices[1].y - vertices[0].y, z: vertices[1].z - vertices[0].z };
      const ac = { x: vertices[2].x - vertices[0].x, y: vertices[2].y - vertices[0].y, z: vertices[2].z - vertices[0].z };
      const cross = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
      const dot = ab.x * ac.x + ab.y * ac.y + ab.z * ac.z;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot / Math.max(1e-12, Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(ac.x, ac.y, ac.z))))) * 180 / Math.PI;
      return `triangle area ${(Math.hypot(cross.x, cross.y, cross.z) / 2).toPrecision(5)} · angle ${angle.toPrecision(4)}°`;
    }
    return '';
  })() : '';

  function copyTransform(kind: 'translate' | 'rotate' | 'reflect' | 'dilate') {
    if (!selected) return;
    const sourceIds = selected.type === 'sphere' || selected.type === 'solid' ? [selected.center] : [...selected.points]; const idMap = new Map<number, number>();
    const additions: Geometry3DPoint[] = sourceIds.map((id, index) => {
      const source = pointById(id)!; const newId = nextPointId() + index; idMap.set(id, newId);
      let { x, y, z } = source;
      if (kind === 'translate') { x += transform.dx; y += transform.dy; z += transform.dz; }
      if (kind === 'dilate') { x *= transform.scale; y *= transform.scale; z *= transform.scale; }
      if (kind === 'reflect') { if (transform.axis === 'x') x *= -1; if (transform.axis === 'y') y *= -1; if (transform.axis === 'z') z *= -1; }
      if (kind === 'rotate') { const angle = transform.angle * Math.PI / 180; const nx = x * Math.cos(angle) - y * Math.sin(angle); y = x * Math.sin(angle) + y * Math.cos(angle); x = nx; }
      return { ...source, id: newId, label: `${source.label}′`, x, y, z };
    });
    const objectId = nextObjectId();
    const copy = selected.type === 'sphere'
      ? { ...selected, id: objectId, center: idMap.get(selected.center)!, radius: kind === 'dilate' ? selected.radius * Math.abs(transform.scale) : selected.radius, label: `${selected.label}′` }
      : selected.type === 'solid'
        ? { ...selected, id: objectId, center: idMap.get(selected.center)!, dimensions: kind === 'dilate' ? selected.dimensions.map((value) => value * Math.abs(transform.scale)) as [number, number, number] : selected.dimensions, label: `${selected.label}′` }
        : { ...selected, id: objectId, points: selected.points.map((id) => idMap.get(id)!) as never, label: `${selected.label}′` };
    setPoints((current) => [...current, ...additions]); setObjects((current) => [...current, copy]); setSelectedObject(objectId);
  }

  return <section className="geometry3d-lab">
    <aside className="geometry3d-sidebar" aria-label="3D geometry expression rail">
      <header><strong>3D constructions</strong><span>{points.length} points · {objects.length} objects</span></header>
      <label className="geometry3d-command-starter">Start with
        <select
          aria-label="3D construction type"
          defaultValue=""
          onChange={(event) => {
            const template = event.target.value;
            if (template) startConstruction(template);
            event.currentTarget.value = '';
          }}
        >
          <option value="" disabled>Choose type…</option>
          <option value={'\\mathrm{point}\\left(#0,#?,#?\\right)'}>Point</option>
          <option value={'\\mathrm{segment}\\left(#0,#?\\right)'}>Segment</option>
          <option value={'\\mathrm{vector}\\left(#0,#?\\right)'}>Vector</option>
          <option value={'\\mathrm{triangle}\\left(#0,#?,#?\\right)'}>Triangle</option>
          <option value={'\\mathrm{midpoint}\\left(#0,#?\\right)'}>Midpoint</option>
          <option value={'\\mathrm{cube}\\left(#0,#?\\right)'}>Cube</option>
          <option value={'\\mathrm{cuboid}\\left(#0,#?,#?,#?\\right)'}>Cuboid</option>
          <option value={'\\mathrm{sphere}\\left(#0,#?\\right)'}>Sphere</option>
          <option value={'\\mathrm{ellipsoid}\\left(#0,#?,#?,#?\\right)'}>Ellipsoid</option>
          <option value={'\\mathrm{cylinder}\\left(#0,#?,#?\\right)'}>Cylinder</option>
          <option value={'\\mathrm{cone}\\left(#0,#?,#?\\right)'}>Cone</option>
          <option value={'\\mathrm{paraboloid}\\left(#0,#?,#?\\right)'}>Paraboloid</option>
        </select>
      </label>
      <label>New construction<ResearchMathField id="research-geometry3d-command" label="3D geometry construction expression" placeholder="point(1,2,3)" value={command} onChange={setCommand} onEnter={runCommand} /></label>
      <button type="button" className="research-primary" onClick={runCommand}>Construct</button>
      {message && <p className="geometry-expression-help">{message}</p>}
      <section className="geometry3d-object-gallery" aria-label="3D object gallery">
        <strong>3D objects</strong>
        <div>{GEOMETRY_3D_OBJECTS.map((item) => <button key={item.primitive} type="button" onClick={() => addPrimitive(item.primitive, item.dimensions)}>{item.label}</button>)}</div>
      </section>
      <section className="geometry3d-points" aria-label="3D geometry points">
        <strong>Points</strong>
        {!points.length && <small>No points yet</small>}
        <div>{points.map((point) => <div key={point.id} className={selectedPoint === point.id ? 'is-active' : ''}>
          <button type="button" aria-label={`Select point ${point.label}`} onClick={() => { setSelectedPoint(point.id); setSelectedObject(null); }}><span style={{ '--graph-color': point.color } as React.CSSProperties} />{point.label}<small>({point.x.toPrecision(3)}, {point.y.toPrecision(3)}, {point.z.toPrecision(3)})</small></button>
          <button type="button" className="is-danger" aria-label={`Delete point ${point.label}`} onClick={() => deletePoint(point.id)}>×</button>
        </div>)}</div>
      </section>
      <div className="geometry3d-list" aria-label="3D geometry objects">
        {objects.map((object) => <button key={object.id} type="button" className={selectedObject === object.id ? 'is-active' : ''} onClick={() => { setSelectedObject(object.id); setSelectedPoint(null); }}><span style={{ '--graph-color': object.color } as React.CSSProperties} />{object.label}<small>{object.type}</small></button>)}
      </div>
      {intersectionMarkers.length > 0 && <section className="research-marker-list" aria-label="Saved 3D geometry intersections"><header><strong>Marked crossings</strong><span>{intersectionMarkers.length}</span></header><ul>{intersectionMarkers.map((marker) => <li key={marker.id}><span>({marker.x.toFixed(3)}, {marker.y.toFixed(3)}, {marker.z.toFixed(3)})</span><button type="button" aria-label={`Delete 3D geometry crossing ${marker.id}`} onClick={() => setIntersectionMarkers((current) => current.filter((item) => item.id !== marker.id))}>×</button></li>)}</ul></section>}
      {measurement && <output className="geometry3d-measurement">{measurement}</output>}
      {selected && <section className="geometry3d-style"><strong>Selected object</strong><label>Label<input value={selected.label} onChange={(event) => setObjects((items) => items.map((object) => object.id === selected.id ? { ...object, label: event.target.value } : object))} /></label><label>Color<input type="color" value={selected.color} onChange={(event) => setObjects((items) => items.map((object) => object.id === selected.id ? { ...object, color: event.target.value } : object))} /></label><label><input type="checkbox" checked={selected.visible} onChange={(event) => setObjects((items) => items.map((object) => object.id === selected.id ? { ...object, visible: event.target.checked } : object))} /> Visible</label>{selected.type === 'sphere' && <label>Radius {selected.radius.toFixed(2)}<input type="range" min=".1" max="10" step=".1" value={selected.radius} onChange={(event) => setObjects((items) => items.map((object) => object.id === selected.id && object.type === 'sphere' ? { ...object, radius: Number(event.target.value) } : object))} /></label>}{selected.type === 'solid' && <div className="geometry3d-dimensions">{(['x', 'y', 'z'] as const).map((axis, index) => {
        const oneSize = ['cube', 'sphere', 'tetrahedron', 'octahedron'].includes(selected.primitive);
        const radial = ['cylinder', 'cone', 'paraboloid'].includes(selected.primitive);
        if ((oneSize && index > 0) || (radial && index === 1)) return null;
        const label = oneSize ? (selected.primitive === 'sphere' ? 'Radius' : 'Size') : radial ? (index === 0 ? 'Radius' : 'Height') : `${axis.toUpperCase()} size`;
        return <label key={axis}>{label}<input type="number" min=".1" max="30" step=".1" value={selected.dimensions[index]} onChange={(event) => {
          const value = Math.max(.1, Number(event.target.value) || .1);
          setObjects((items) => items.map((object) => {
            if (object.id !== selected.id || object.type !== 'solid') return object;
            const dimensions = [...object.dimensions] as [number, number, number];
            if (oneSize) dimensions.fill(value); else if (radial && index === 0) { dimensions[0] = value; dimensions[1] = value; } else dimensions[index] = value;
            return { ...object, dimensions };
          }));
        }} /></label>;
      })}</div>}<button className="is-danger" onClick={() => { setObjects((items) => items.filter((object) => object.id !== selected.id)); setSelectedObject(null); }}>Delete selected object</button></section>}
      <section className="geometry3d-transform"><strong>Transform a copy</strong><div><label>dx<input type="number" value={transform.dx} onChange={(event) => setTransform((value) => ({ ...value, dx: Number(event.target.value) }))} /></label><label>dy<input type="number" value={transform.dy} onChange={(event) => setTransform((value) => ({ ...value, dy: Number(event.target.value) }))} /></label><label>dz<input type="number" value={transform.dz} onChange={(event) => setTransform((value) => ({ ...value, dz: Number(event.target.value) }))} /></label></div><button disabled={!selected} onClick={() => copyTransform('translate')}>Translate copy</button><label>Angle °<input type="number" value={transform.angle} onChange={(event) => setTransform((value) => ({ ...value, angle: Number(event.target.value) }))} /></label><button disabled={!selected} onClick={() => copyTransform('rotate')}>Rotate about z</button><label>Scale<input type="number" value={transform.scale} onChange={(event) => setTransform((value) => ({ ...value, scale: Number(event.target.value) }))} /></label><button disabled={!selected} onClick={() => copyTransform('dilate')}>Dilate copy</button><label>Reflect axis<select value={transform.axis} onChange={(event) => setTransform((value) => ({ ...value, axis: event.target.value as 'x' | 'y' | 'z' }))}><option>x</option><option>y</option><option>z</option></select></label><button disabled={!selected} onClick={() => copyTransform('reflect')}>Reflect copy</button></section>
    </aside>
    <div className="geometry3d-stage">
      <div className="graph-controls"><button aria-label="Zoom 3D geometry in" onClick={() => setCamera((view) => ({ ...view, zoom: Math.min(8, view.zoom * 1.25) }))}>+</button><button aria-label="Zoom 3D geometry out" onClick={() => setCamera((view) => ({ ...view, zoom: Math.max(.15, view.zoom / 1.25) }))}>−</button><button aria-label="Fit 3D geometry" onClick={() => setCamera({ yaw: -.72, pitch: -.52, zoom: 1, panX: 0, panY: 0 })}>Fit</button><button aria-label="Top 3D geometry camera" onClick={() => setCamera((view) => ({ ...view, yaw: 0, pitch: -1.5 }))}>Top</button><button aria-label="Front 3D geometry camera" onClick={() => setCamera((view) => ({ ...view, yaw: 0, pitch: 0 }))}>Front</button><button aria-label="Side 3D geometry camera" onClick={() => setCamera((view) => ({ ...view, yaw: -Math.PI / 2, pitch: 0 }))}>Side</button></div>
      <div className="geometry3d-axis-controls"><span>Move point</span>{(['screen', 'x', 'y', 'z'] as const).map((axis) => <button key={axis} className={moveAxis === axis ? 'is-active' : ''} onClick={() => setMoveAxis(axis)}>{axis}</button>)}</div>
      <canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height} aria-label="Interactive 3D geometry canvas" data-camera-yaw={camera.yaw} data-camera-pitch={camera.pitch}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId); const bounds = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - bounds.left) * event.currentTarget.width / bounds.width; const y = (event.clientY - bounds.top) * event.currentTarget.height / bounds.height;
          const crossing = projectedIntersections.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.sx - x, candidate.sy - y) })).sort((a, b) => a.distance - b.distance)[0];
          if (crossing && crossing.distance <= 17) { const marker = { id: crossing.candidate.id, x: crossing.candidate.x, y: crossing.candidate.y, z: crossing.candidate.z }; setIntersectionMarkers((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker]); setHoverIntersection(marker); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return; }
          const nearest = projectedPoints.current.map((point) => ({ ...point, distance: Math.hypot(point.sx - x, point.sy - y) })).sort((a, b) => a.distance - b.distance)[0]; const point = nearest && nearest.distance < 18 ? pointById(nearest.id) : undefined;
          if (point) setSelectedPoint(point.id); drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch, panX: camera.panX ?? 0, panY: camera.panY ?? 0, pan: event.shiftKey, point };
        }}
        onPointerMove={(event) => { const current = drag.current; if (!current || current.pointerId !== event.pointerId) { const bounds = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - bounds.left) * event.currentTarget.width / bounds.width; const y = (event.clientY - bounds.top) * event.currentTarget.height / bounds.height; const crossing = projectedIntersections.current.map((candidate) => ({ candidate, distance: Math.hypot(candidate.sx - x, candidate.sy - y) })).sort((a, b) => a.distance - b.distance)[0]; setHoverIntersection(crossing && crossing.distance <= 17 ? crossing.candidate : null); return; } setHoverIntersection(null); const dx = (event.clientX - current.x) / (30 * camera.zoom); const dy = (event.clientY - current.y) / (30 * camera.zoom); if (!current.point) { if (current.pan) setCamera((view) => ({ ...view, panX: current.panX + event.clientX - current.x, panY: current.panY + event.clientY - current.y })); else setCamera((view) => orbitGeometry3DCamera({ ...view, yaw: current.yaw, pitch: current.pitch }, event.clientX - current.x, event.clientY - current.y)); return; } setPoints((items) => items.map((point) => point.id !== current.point!.id ? point : { ...point, x: moveAxis === 'y' || moveAxis === 'z' ? current.point!.x : current.point!.x + dx, y: moveAxis === 'x' || moveAxis === 'z' ? current.point!.y : current.point!.y - dy, z: moveAxis === 'z' ? current.point!.z - dy : current.point!.z })); }}
        onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }}
        onPointerLeave={() => { if (!drag.current) setHoverIntersection(null); }}
        onWheel={(event) => { event.preventDefault(); setCamera((view) => ({ ...view, zoom: Math.max(.15, Math.min(8, view.zoom * Math.exp(-event.deltaY * .0015))) })); }} />
      {selectedPoint && pointById(selectedPoint) && <div className="geometry3d-point-editor">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>{axis}<input type="number" step=".1" value={pointById(selectedPoint)![axis]} onChange={(event) => setPoints((items) => items.map((point) => point.id === selectedPoint ? { ...point, [axis]: Number(event.target.value) } : point))} /></label>)}<button type="button" aria-label={`Delete selected point ${pointById(selectedPoint)!.label}`} onClick={() => deletePoint(selectedPoint)}>Delete point</button></div>}
      {hoverIntersection && <output className="graph-trace graph-trace--3d" style={{ '--graph-color': '#8e5aa4' } as React.CSSProperties}>Crossing: x = {hoverIntersection.x.toFixed(3)} · y = {hoverIntersection.y.toFixed(3)} · z = {hoverIntersection.z.toFixed(3)} · click to mark</output>}
      <p className="geometry3d-help">Drag blank space to orbit · Shift-drag to pan · wheel/pinch to zoom · drag a point along the selected axis</p>
    </div>
  </section>;
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
  const [expression, setExpression] = usePersistentResearchState(`${storagePrefix}:scientific:expression`, '');
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
      if (isResearchCalculationLatex(expressionWithAnswer)) {
        const checked = await evaluateResearchLatex(expressionWithAnswer);
        setHistory((current) => [...current.slice(-29), {
          id: Math.max(0, ...current.map((entry) => entry.id)) + 1,
          expressionLatex: expression,
          resultLatex: checked.latex,
          exact: checked.exact,
          decimal: checked.decimal,
        }]);
        setExpression('');
        if (fieldRef.current) fieldRef.current.value = '';
        setError('');
        return;
      }
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

export function ResearchToolsPanel({ initialTool = '2d', onClose, open = true, notebookId = 'default', workspaceObjectId = null }: { initialTool?: ResearchTool; onClose: () => void; open?: boolean; notebookId?: string; workspaceObjectId?: string | null }) {
  const storagePrefix = workspaceObjectId ? `mathkhata:research-object:${workspaceObjectId}` : `mathkhata:research:${notebookId}`;
  const [tool, setTool] = usePersistentResearchState<ResearchTool>(`${storagePrefix}:tool`, initialTool);
  const notebook = useNotebookStore((state) => state.notebook);
  const setPaletteOpen = useNotebookStore((state) => state.setPaletteOpen);
  const paletteOpen = useNotebookStore((state) => state.paletteOpen);
  const resetResearchSection = useNotebookStore((state) => state.resetResearchSection);
  const copyResearchToPage = useNotebookStore((state) => state.copyResearchToPage);
  const updateResearchObjectPreview = useNotebookStore((state) => state.updateResearchObjectPreview);
  const undo = useNotebookStore((state) => state.undo);
  const panelRef = useRef<HTMLElement | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [destinationPageId, setDestinationPageId] = useState('');
  const [restoreMessage, setRestoreMessage] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  useEffect(() => {
    if (open && workspaceObjectId) setTool(initialTool);
  }, [initialTool, open, setTool, workspaceObjectId]);
  useEffect(() => {
    if (!open) return undefined;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (guideOpen) { event.preventDefault(); event.stopPropagation(); setGuideOpen(false); return; }
        if (document.querySelector('.graph-settings-popover')) return;
        const geometryCanvas = document.querySelector<HTMLCanvasElement>('canvas[aria-label="Interactive geometry canvas"]');
        if (geometryCanvas?.dataset.tool && geometryCanvas.dataset.tool !== 'move') return;
        event.preventDefault(); event.stopPropagation(); onClose();
      }
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [guideOpen, onClose, open]);
  const footer = guideOpen
    ? 'This guide documents the current local implementation. Unsupported input is reported instead of being silently approximated.'
    : tool === 'loglog'
    ? 'Base-10 log-log graphing for positive data, power laws, curve inspection, and persistent intersection markers.'
    : tool === '3d'
    ? 'Local interactive 3D: explicit, parametric, and sampled implicit surfaces; sliders, points, curves, traces, viewport locks, and sampled intersections.'
    : tool === 'geometry'
      ? 'Local dynamic geometry: constructions, expressions, multi-select styling, transformations, dragging, measurements, and line/circle intersections.'
      : tool === 'geometry3d'
        ? 'Local 3D geometry: points, constructions, nine solid and curved primitives, measurements, transforms, and an orbitable camera.'
      : 'All calculations run locally. Verify research-critical results with the checked solver or AION.';
  const canCopy = tool !== 'scientific';
  const performCopy = () => {
    if (!notebook || !destinationPageId || !canCopy) return;
    const preview = captureResearchPreview(panelRef.current);
    copyResearchToPage(tool, destinationPageId, preview);
    setCopyOpen(false);
    onClose();
  };
  const performPdfExport = async () => {
    const title = TABS.find((tab) => tab.id === tool)?.label ?? 'Research';
    setExportingPdf(true);
    try {
      await downloadResearchPdf({
        title: `${title} — Math Notebook`,
        subtitle: tool === 'scientific' ? 'Complete scientific calculation history' : 'Graph, equations, parameters, measurements, and saved intersection markers',
        imageDataUrl: tool === 'scientific' ? null : captureResearchPreview(panelRef.current),
        sections: collectResearchPdfSections(panelRef.current, tool),
        filename: `math-notebook-${slugifyResearchFilename(title)}.pdf`,
      });
      setRestoreMessage(`${title} PDF downloaded.`);
    } catch (exportError) {
      setRestoreMessage(exportError instanceof Error ? `PDF export failed: ${exportError.message}` : 'PDF export failed.');
    } finally {
      setExportingPdf(false);
    }
  };
  return (
    <aside ref={panelRef} className="research-tools-panel" aria-label="Research mathematics tools" data-testid="research-tools-panel" hidden={!open}>
      <header><div><strong>{workspaceObjectId ? 'Edit page research copy' : 'Research workspace'}</strong><span>Graph · geometry · scientific</span></div><div className="research-header-actions">
        {workspaceObjectId && <button type="button" onClick={() => {
          const preview = captureResearchPreview(panelRef.current);
          updateResearchObjectPreview(workspaceObjectId, preview);
          setRestoreMessage('Page copy preview saved.');
        }}>Save page copy</button>}
        {!workspaceObjectId && canCopy && <button type="button" onClick={() => { setDestinationPageId(notebook?.pages[0]?.id ?? ''); setCopyOpen(true); }}>Copy to notebook</button>}
        {!guideOpen && <button type="button" disabled={exportingPdf} onClick={() => void performPdfExport()}>{exportingPdf ? 'Preparing PDF…' : 'Download PDF'}</button>}
        {!workspaceObjectId && <button type="button" onClick={() => {
          if (!window.confirm(`Reset all saved data in ${TABS.find((tab) => tab.id === tool)?.label}? You can restore it with Undo.`)) return;
          resetResearchSection(tool); setRestoreMessage(`${TABS.find((tab) => tab.id === tool)?.label} reset.`);
        }}>Reset data</button>}
        {!workspaceObjectId && <button type="button" onClick={() => {
          if (!window.confirm('Reset every research section in this notebook? You can restore it with Undo.')) return;
          resetResearchSection('all'); setRestoreMessage('All research sections reset.');
        }}>Reset all</button>}
        <button type="button" aria-label="Close research tools" onClick={onClose}>×</button>
      </div></header>
      <nav aria-label="Research tool sections">{TABS.map((tab) => <button type="button" key={tab.id} className={!guideOpen && tool === tab.id ? 'is-active' : ''} onClick={() => { setTool(tab.id); setGuideOpen(false); }}>{tab.label}</button>)}<button type="button" className={guideOpen ? 'is-active' : ''} aria-pressed={guideOpen} onClick={() => setGuideOpen((current) => !current)}>Guide</button></nav>
      {!guideOpen && <div className="research-math-toolbar" aria-label="Research mathematics input tools">
        <button type="button" onClick={() => { if (!focusActiveMathfield()) return; if (window.mathVirtualKeyboard.visible) window.mathVirtualKeyboard.hide(); else window.mathVirtualKeyboard.show(); }}>⌨ Math keyboard</button>
        <button type="button" data-math-menu-toggle="true" onClick={() => { if (dismissActiveMathfieldMenu()) return; showActiveMathfieldMenu(); }}>☰ Insert structures</button>
        <button type="button" className={paletteOpen ? 'is-active' : ''} onClick={() => { dismissActiveMathfieldMenu(); setPaletteOpen(!paletteOpen); }}>Ω Symbols</button>
      </div>}
      {restoreMessage && <div className="research-restore" role="status"><span>{restoreMessage}</span><button type="button" onClick={() => { undo(); setRestoreMessage('Research restored.'); }}>Restore</button><button type="button" aria-label="Dismiss restore message" onClick={() => setRestoreMessage('')}>×</button></div>}
      <div className="research-tools-panel__body">
        {guideOpen ? <ResearchGuide tool={tool} /> : <>
          {tool === '2d' && <Graph2D storagePrefix={storagePrefix} />}
          {tool === 'loglog' && <LogLogGraph storagePrefix={storagePrefix} />}
          {tool === '3d' && <Graph3D storagePrefix={storagePrefix} />}
          {tool === 'geometry' && <GeometryLab storagePrefix={storagePrefix} />}
          {tool === 'geometry3d' && <Geometry3DLab storagePrefix={storagePrefix} />}
          {tool === 'scientific' && <ScientificLab storagePrefix={storagePrefix} />}
        </>}
      </div>
      <footer>{footer}</footer>
      {copyOpen && <div className="research-copy-dialog" role="dialog" aria-modal="true" aria-label="Copy research to notebook">
        <header><strong>Copy independent snapshot</strong><button type="button" aria-label="Close copy dialog" onClick={() => setCopyOpen(false)}>×</button></header>
        <p>The graph, constructions, camera, and styles are copied independently. Later source resets will not alter the page copy.</p>
        <label>Destination page<select value={destinationPageId} onChange={(event) => setDestinationPageId(event.target.value)}>{notebook?.pages.map((page, index) => <option key={page.id} value={page.id}>Page {index + 1}{page.favorite ? ' ★' : ''}</option>)}</select></label>
        <div className="research-placement-preview" aria-label="Research card placement preview"><span>Ruled page preview</span><i><b>{TABS.find((tab) => tab.id === tool)?.label}</b></i></div>
        <div><button type="button" onClick={() => setCopyOpen(false)}>Cancel</button><button type="button" className="research-primary" onClick={performCopy}>Copy and open page</button></div>
      </div>}
    </aside>
  );
}
