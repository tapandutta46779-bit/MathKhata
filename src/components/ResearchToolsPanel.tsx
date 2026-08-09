import { useEffect, useRef, useState } from 'react';

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

interface GraphExpression {
  id: number;
  expression: string;
  color: string;
  visible: boolean;
}

function Graph2D() {
  const [expressions, setExpressions] = useState<GraphExpression[]>([
    { id: 1, expression: 'sin(x)', color: GRAPH_COLORS[0], visible: true },
    { id: 2, expression: 'x^2/8-2', color: GRAPH_COLORS[1], visible: true },
  ]);
  const [viewport, setViewport] = useState({ centerX: 0, centerY: 0, scale: 52 });
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

function Graph3D() {
  const [expression, setExpression] = useState('sin(x)*cos(y)');
  const [domain, setDomain] = useState(5);
  const [resolution, setResolution] = useState(25);
  const [camera, setCamera] = useState({ yaw: -.72, pitch: -.58, zoom: 1 });
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

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
        const evaluate = await numericEvaluator(expression);
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
          return { x: canvas.width / 2 + yawX * scale, y: canvas.height / 2 + pitchY * scale, depth };
        };
        const grid: Array<Array<{ x: number; y: number; z: number; depth: number }>> = [];
        for (let row = 0; row < resolution; row += 1) {
          const points = [];
          const y = -domain + row * domain * 2 / (resolution - 1);
          for (let column = 0; column < resolution; column += 1) {
            const x = -domain + column * domain * 2 / (resolution - 1);
            const rawZ = evaluate({ x, y });
            const z = Math.max(-domain * 2, Math.min(domain * 2, rawZ));
            if (cancelled) return;
            points.push({ ...project(x, y, z), z });
          }
          grid.push(points);
        }
        const cells: Array<{ points: Array<{ x: number; y: number }>; depth: number; height: number }> = [];
        for (let row = 0; row < resolution - 1; row += 1) {
          for (let column = 0; column < resolution - 1; column += 1) {
            const points = [grid[row][column], grid[row][column + 1], grid[row + 1][column + 1], grid[row + 1][column]];
            if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
            cells.push({
              points,
              depth: points.reduce((sum, point) => sum + point.depth, 0) / 4,
              height: points.reduce((sum, point) => sum + point.z, 0) / 4,
            });
          }
        }
        cells.sort((left, right) => left.depth - right.depth);
        for (const cell of cells) {
          const hue = 18 + Math.max(0, Math.min(1, (cell.height / domain + 1) / 2)) * 195;
          context.fillStyle = `hsla(${hue}, 52%, 58%, .43)`;
          context.strokeStyle = `hsla(${hue}, 48%, 38%, .46)`;
          context.lineWidth = .75;
          context.beginPath();
          cell.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
          context.closePath();
          context.fill();
          context.stroke();
        }
        const axes = [
          { end: project(domain * 1.2, 0, 0), label: 'x', color: '#a45236' },
          { end: project(0, domain * 1.2, 0), label: 'y', color: '#3777a5' },
          { end: project(0, 0, domain * 1.2), label: 'z', color: '#5f8b4c' },
        ];
        const origin = project(0, 0, 0);
        context.font = 'bold 12px ui-monospace, monospace';
        axes.forEach((axis) => {
          context.strokeStyle = axis.color; context.lineWidth = 2; context.beginPath();
          context.moveTo(origin.x, origin.y); context.lineTo(axis.end.x, axis.end.y); context.stroke();
          context.fillStyle = axis.color; context.fillText(axis.label, axis.end.x + 4, axis.end.y - 4);
        });
        setError('');
      } catch {
        setError('Enter a surface in x and y, for example x^2-y^2 or sin(x)*cos(y).');
      }
    };
    void draw();
    return () => { cancelled = true; };
  }, [camera, domain, expression, resolution]);

  return (
    <section className="research-graph-lab research-graph-lab--3d">
      <aside className="graph-expression-list">
        <header><strong>Surface</strong><span>z = f(x,y)</span></header>
        <div className="graph-expression graph-expression--surface">
          <span className="graph-color is-visible" style={{ '--graph-color': '#9a482c' } as React.CSSProperties} />
          <label><span>z =</span><input aria-label="3D surface expression" value={expression} onChange={(event) => setExpression(event.target.value)} /></label>
        </div>
        <label className="graph-slider">Domain ±{domain}<input type="range" min="2" max="12" step="1" value={domain} onChange={(event) => setDomain(Number(event.target.value))} /></label>
        <label className="graph-slider">Mesh {resolution}×{resolution}<input type="range" min="15" max="39" step="2" value={resolution} onChange={(event) => setResolution(Number(event.target.value))} /></label>
        <p>Drag to rotate · wheel to zoom · colored height mesh</p>
      </aside>
      <div className="graph-stage">
        <div className="graph-controls" aria-label="3D graph view controls">
          <button type="button" aria-label="Zoom 3D view in" onClick={() => setCamera((view) => ({ ...view, zoom: Math.min(2.6, view.zoom * 1.2) }))}>+</button>
          <button type="button" aria-label="Zoom 3D view out" onClick={() => setCamera((view) => ({ ...view, zoom: Math.max(.45, view.zoom / 1.2) }))}>−</button>
          <button type="button" aria-label="Reset 3D view" onClick={() => setCamera({ yaw: -.72, pitch: -.58, zoom: 1 })}>⌂</button>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          aria-label={`Interactive 3D surface of ${expression}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch };
          }}
          onPointerMove={(event) => {
            if (!dragRef.current) return;
            const drag = dragRef.current;
            setCamera((view) => ({
              ...view,
              yaw: drag.yaw + (event.clientX - drag.x) * .009,
              pitch: Math.max(-1.45, Math.min(1.45, drag.pitch + (event.clientY - drag.y) * .009)),
            }));
          }}
          onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { dragRef.current = null; }}
          onWheel={(event) => {
            event.preventDefault();
            setCamera((view) => ({ ...view, zoom: Math.max(.45, Math.min(2.6, view.zoom * Math.exp(-event.deltaY * .0015))) }));
          }}
        />
        {error && <p className="research-tool-error graph-error">{error}</p>}
      </div>
    </section>
  );
}

interface GeometryPoint { x: number; y: number }

function GeometryLab() {
  const [points, setPoints] = useState<GeometryPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fffefa';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#d8d4ca';
    for (let x = 0; x < canvas.width; x += 25) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
    }
    for (let y = 0; y < canvas.height; y += 25) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
    }
    if (points.length) {
      context.strokeStyle = '#9a482c'; context.lineWidth = 2; context.beginPath();
      points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      if (points.length > 2) context.closePath();
      context.stroke();
      points.forEach((point, index) => {
        context.fillStyle = '#3777a5'; context.beginPath(); context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#292821'; context.fillText(String.fromCharCode(65 + index), point.x + 7, point.y - 7);
      });
    }
  }, [points]);
  const distance = (a: GeometryPoint, b: GeometryPoint) => Math.hypot(a.x - b.x, a.y - b.y) / 25;
  const perimeter = points.length > 1
    ? points.reduce((total, point, index) => total + distance(point, points[(index + 1) % points.length]), 0)
    : 0;
  const area = points.length > 2
    ? Math.abs(points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return total + point.x * next.y - next.x * point.y;
    }, 0)) / (2 * 25 * 25)
    : 0;
  return (
    <section className="research-canvas-tool">
      <div className="geometry-actions">
        <span>Tap to add points · {points.length} points · perimeter {perimeter.toFixed(2)} · area {area.toFixed(2)}</span>
        <button type="button" disabled={!points.length} onClick={() => setPoints((current) => current.slice(0, -1))}>Undo point</button>
        <button type="button" disabled={!points.length} onClick={() => setPoints([])}>Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        width={660}
        height={380}
        aria-label="Interactive geometry canvas"
        onPointerDown={(event) => {
          const canvas = event.currentTarget;
          const bounds = canvas.getBoundingClientRect();
          const point = {
            x: (event.clientX - bounds.left) * canvas.width / bounds.width,
            y: (event.clientY - bounds.top) * canvas.height / bounds.height,
          };
          setPoints((current) => [...current, {
            x: point.x,
            y: point.y,
          }]);
        }}
      />
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

export function ResearchToolsPanel({ initialTool = '2d', onClose }: { initialTool?: ResearchTool; onClose: () => void }) {
  const [tool, setTool] = useState<ResearchTool>(initialTool);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [onClose]);
  return (
    <aside className="research-tools-panel" aria-label="Research mathematics tools" data-testid="research-tools-panel">
      <header><div><strong>Research workspace</strong><span>Graph · geometry · scientific</span></div><button type="button" aria-label="Close research tools" onClick={onClose}>×</button></header>
      <nav aria-label="Research tool sections">{TABS.map((tab) => <button type="button" key={tab.id} className={tool === tab.id ? 'is-active' : ''} onClick={() => setTool(tab.id)}>{tab.label}</button>)}</nav>
      <div className="research-tools-panel__body">
        {tool === '2d' && <Graph2D />}
        {tool === '3d' && <Graph3D />}
        {tool === 'geometry' && <GeometryLab />}
        {tool === 'scientific' && <ScientificLab />}
      </div>
      <footer>All calculations run locally. Graphs are exploratory previews; verify research-critical results with CAS or AION.</footer>
    </aside>
  );
}
