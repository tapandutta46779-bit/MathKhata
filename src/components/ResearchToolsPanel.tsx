import { useEffect, useRef, useState } from 'react';

export type ResearchTool = '2d' | '3d' | 'geometry' | 'scientific';

const TABS: Array<{ id: ResearchTool; label: string }> = [
  { id: '2d', label: '2D Graph' },
  { id: '3d', label: '3D Surface' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'scientific', label: 'Scientific' },
];

async function numericValue(expression: string, substitutions: Record<string, number> = {}): Promise<number> {
  const { default: nerdamer } = await import('nerdamer-prime');
  nerdamer.set('SILENCE_WARNINGS', true);
  const value = nerdamer(expression).evaluate(substitutions).text('decimals');
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error('The expression is not finite over this point.');
  return numeric;
}

function Graph2D() {
  const [expression, setExpression] = useState('sin(x)');
  const [range, setRange] = useState(10);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#fffefa';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = '#d9d5ca';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.moveTo(width / 2, 0);
      context.lineTo(width / 2, height);
      context.stroke();
      context.strokeStyle = '#9a482c';
      context.lineWidth = 2;
      context.beginPath();
      let drawing = false;
      try {
        for (let pixel = 0; pixel <= width; pixel += 2) {
          const x = (pixel / width * 2 - 1) * range;
          const y = await numericValue(expression, { x });
          if (cancelled) return;
          const screenY = height / 2 - y * height / (2 * range);
          if (!Number.isFinite(screenY) || screenY < -height * 3 || screenY > height * 4) {
            drawing = false;
          } else if (!drawing) {
            context.moveTo(pixel, screenY);
            drawing = true;
          } else context.lineTo(pixel, screenY);
        }
        context.stroke();
        setError('');
      } catch {
        setError('Enter an expression in x, for example sin(x), x^2, or exp(-x^2).');
      }
    };
    void draw();
    return () => { cancelled = true; };
  }, [expression, range]);

  return (
    <section className="research-canvas-tool">
      <div className="research-expression-row">
        <label>y = <input value={expression} onChange={(event) => setExpression(event.target.value)} /></label>
        <label>range ± <input type="number" min="1" max="100" value={range} onChange={(event) => setRange(Math.max(1, Number(event.target.value) || 10))} /></label>
      </div>
      <canvas ref={canvasRef} width={660} height={380} aria-label={`2D graph of ${expression}`} />
      {error && <p className="research-tool-error">{error}</p>}
    </section>
  );
}

function Graph3D() {
  const [expression, setExpression] = useState('sin(x)*cos(y)');
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#fffefa';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const project = (x: number, y: number, z: number) => ({
        x: canvas.width / 2 + (x - y) * 29,
        y: canvas.height / 2 + (x + y) * 13 - z * 24,
      });
      try {
        const size = 15;
        const grid: Array<Array<{ x: number; y: number }>> = [];
        for (let row = 0; row < size; row += 1) {
          const points = [];
          const y = -4 + row * 8 / (size - 1);
          for (let column = 0; column < size; column += 1) {
            const x = -4 + column * 8 / (size - 1);
            const z = await numericValue(expression, { x, y });
            if (cancelled) return;
            points.push(project(x, y, Math.max(-8, Math.min(8, z))));
          }
          grid.push(points);
        }
        context.lineWidth = 1;
        const drawLine = (points: Array<{ x: number; y: number }>, color: string) => {
          context.strokeStyle = color;
          context.beginPath();
          points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
          context.stroke();
        };
        grid.forEach((row) => drawLine(row, 'rgba(154,72,44,.72)'));
        for (let column = 0; column < size; column += 1) drawLine(grid.map((row) => row[column]), 'rgba(55,119,165,.58)');
        setError('');
      } catch {
        setError('Enter a surface in x and y, for example x^2-y^2 or sin(x)*cos(y).');
      }
    };
    void draw();
    return () => { cancelled = true; };
  }, [expression]);

  return (
    <section className="research-canvas-tool">
      <div className="research-expression-row"><label>z = <input value={expression} onChange={(event) => setExpression(event.target.value)} /></label></div>
      <canvas ref={canvasRef} width={660} height={380} aria-label={`3D wireframe surface of ${expression}`} />
      <p className="research-tool-hint">Local interactive wireframe preview. Drag/rotation and implicit surfaces are planned behind the same workspace boundary.</p>
      {error && <p className="research-tool-error">{error}</p>}
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
